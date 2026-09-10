#!/usr/bin/env node

const MANIFEST_HEADERS = {
  Accept: "application/expo+json",
  "Expo-Platform": "ios",
};

class PreviewCheckError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "PreviewCheckError";
    this.category = "launcher/manifest";
  }
}

function safeUrlLabel(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname || "/"}`;
  } catch {
    return "configured Expo preview endpoint";
  }
}

function configuredPreviewUrl(argv = process.argv.slice(2), env = process.env) {
  const urlFlagIndex = argv.indexOf("--url");
  const flagValue = urlFlagIndex >= 0 ? argv[urlFlagIndex + 1] : undefined;
  const configured = flagValue || env.IOS_PREVIEW_URL || env.EXPO_PREVIEW_URL
    || (env.REPLIT_EXPO_DEV_DOMAIN ? `https://${env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

  if (!configured) {
    throw new PreviewCheckError(
      "set REPLIT_EXPO_DEV_DOMAIN or pass --url https://<public-expo-domain>",
    );
  }

  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new PreviewCheckError("the configured Expo preview endpoint is not a valid URL");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new PreviewCheckError("the configured Expo preview endpoint must be an HTTP(S) URL without credentials");
  }

  url.search = "";
  url.hash = "";
  return url;
}

function isJavaScriptBundle(response, body) {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const trimmed = body.trim();
  if (!trimmed || /^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return false;
  }

  if (contentType.includes("javascript") || contentType.includes("ecmascript")) {
    return true;
  }

  // Some development proxies omit Content-Type. Reject obvious HTML/error pages,
  // but allow a non-empty body so the check remains useful across proxy versions.
  return !contentType.includes("text/html") && !/^failed to /i.test(trimmed);
}

async function checkIosPreview({ previewUrl, fetchImpl = fetch } = {}) {
  const endpoint = previewUrl instanceof URL ? previewUrl : new URL(previewUrl);
  const manifestResponse = await fetchResponseWith(fetchImpl, endpoint, {
    headers: MANIFEST_HEADERS,
  }, "the Expo iOS manifest endpoint");

  if (!manifestResponse.ok) {
    throw new PreviewCheckError(
      `the Expo iOS manifest endpoint returned HTTP ${manifestResponse.status}`,
    );
  }

  let manifest;
  try {
    manifest = await manifestResponse.json();
  } catch {
    throw new PreviewCheckError(
      `the Expo endpoint did not return valid Expo JSON (${safeUrlLabel(endpoint)})`,
    );
  }

  const launchAssetUrl = manifest?.launchAsset?.url;
  if (typeof launchAssetUrl !== "string" || !launchAssetUrl) {
    throw new PreviewCheckError("the Expo manifest is missing launchAsset.url");
  }

  let launchAsset;
  try {
    launchAsset = new URL(launchAssetUrl, endpoint);
  } catch {
    throw new PreviewCheckError("the Expo manifest contains an invalid launchAsset.url");
  }

  if (!["http:", "https:"].includes(launchAsset.protocol)
    || launchAsset.username || launchAsset.password) {
    throw new PreviewCheckError("the Expo manifest contains an unsafe launchAsset.url");
  }

  const bundleResponse = await fetchResponseWith(fetchImpl, launchAsset, {}, "the Expo iOS launch asset");
  if (!bundleResponse.ok) {
    throw new PreviewCheckError(
      `the Expo iOS launch asset returned HTTP ${bundleResponse.status}`,
    );
  }

  let bundle;
  try {
    bundle = await bundleResponse.text();
  } catch {
    throw new PreviewCheckError("the Expo iOS launch asset could not be read");
  }

  if (!isJavaScriptBundle(bundleResponse, bundle)) {
    throw new PreviewCheckError("the Expo iOS launch asset was empty or was not a JavaScript bundle");
  }

  return {
    manifestUrl: safeUrlLabel(endpoint),
    launchAssetUrl: safeUrlLabel(launchAsset),
    launchAssetBytes: Buffer.byteLength(bundle, "utf8"),
  };
}

async function fetchResponseWith(fetchImpl, url, init, description) {
  try {
    return await fetchImpl(url, init);
  } catch {
    throw new PreviewCheckError(`${description} is unavailable`);
  }
}

async function main() {
  const previewUrl = configuredPreviewUrl();
  const result = await checkIosPreview({ previewUrl });
  console.log(
    `iOS preview handoff OK: Expo manifest and ${result.launchAssetBytes}-byte JavaScript launch asset are available.`,
  );
  console.log(
    "This check covers the launcher/manifest handoff only; an app crash after launch is a [javascript-runtime] failure.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const message = error instanceof PreviewCheckError
      ? error.message
      : "the iOS preview handoff check could not complete";
    console.error(`iOS preview handoff failed [launcher/manifest]: ${message}`);
    process.exitCode = 1;
  });
}

export {
  MANIFEST_HEADERS,
  PreviewCheckError,
  checkIosPreview,
  configuredPreviewUrl,
  isJavaScriptBundle,
  safeUrlLabel,
};