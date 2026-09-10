import test from "node:test";
import assert from "node:assert/strict";
import {
  MANIFEST_HEADERS,
  PreviewCheckError,
  checkIosPreview,
  configuredPreviewUrl,
} from "../scripts/check-ios-preview.mjs";

function response(body, { status = 200, contentType = "application/json" } = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

test("requests an iOS Expo manifest and validates its launch asset", async () => {
  const requests = [];
  const result = await checkIosPreview({
    previewUrl: new URL("https://preview.example.test/"),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) {
        return response(JSON.stringify({
          launchAsset: { url: "/launch-assets/index.bundle?platform=ios" },
        }));
      }
      return response("globalThis.__expoPreviewSmokeTest = true;", {
        contentType: "application/javascript",
      });
    },
  });

  assert.deepEqual(requests[0].init.headers, MANIFEST_HEADERS);
  assert.equal(requests[0].url, "https://preview.example.test/");
  assert.equal(requests[1].url, "https://preview.example.test/launch-assets/index.bundle?platform=ios");
  assert.equal(result.launchAssetBytes, Buffer.byteLength("globalThis.__expoPreviewSmokeTest = true;", "utf8"));
});

test("classifies malformed manifests as launcher/manifest failures without echoing URLs", async () => {
  const secretUrl = new URL("https://preview.example.test/?token=do-not-print");

  await assert.rejects(
    checkIosPreview({
      previewUrl: secretUrl,
      fetchImpl: async () => response("<html>web preview</html>", {
        contentType: "text/html",
      }),
    }),
    (error) => {
      assert.ok(error instanceof PreviewCheckError);
      assert.equal(error.category, "launcher/manifest");
      assert.match(error.message, /valid Expo JSON/);
      assert.doesNotMatch(error.message, /do-not-print/);
      return true;
    },
  );
});

test("rejects an empty or HTML launch asset", async () => {
  let requestCount = 0;
  await assert.rejects(
    checkIosPreview({
      previewUrl: new URL("https://preview.example.test/"),
      fetchImpl: async () => {
        requestCount += 1;
        return requestCount === 1
        ? response(JSON.stringify({ launchAsset: { url: "/bundle.js" } }))
        : response("<!doctype html><html>error</html>", { contentType: "text/html" });
      },
    }),
    /empty or was not a JavaScript bundle/,
  );
});

test("requires a public endpoint configuration without exposing credentials", () => {
  assert.throws(
    () => configuredPreviewUrl(["--url", "https://user:secret@preview.example.test"]),
    /without credentials/,
  );
  assert.throws(
    () => configuredPreviewUrl([], {}),
    /REPLIT_EXPO_DEV_DOMAIN/,
  );
});