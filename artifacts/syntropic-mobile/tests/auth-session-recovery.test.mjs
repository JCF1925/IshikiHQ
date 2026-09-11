import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const customFetchModule = await import('../../../lib/api-client-react/src/custom-fetch.ts');
const {
  customFetch,
  setAuthFailureHandler,
  setAuthTokenGetter,
} = customFetchModule;
const providerSource = await readFile(
  new URL('../providers/AppProvider.tsx', import.meta.url),
  'utf8',
);

function invalidSessionResponse() {
  return new Response(JSON.stringify({ error: { code: 'invalid_session' } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

test('ignores a late invalid-session response from the previous token', async () => {
  const originalFetch = globalThis.fetch;
  let activeToken = 'previous-token';
  let signedOut = false;
  let resolvePreviousRequest;

  setAuthTokenGetter(() => activeToken);
  setAuthFailureHandler((error, token) => {
    if (error?.data?.error?.code === 'invalid_session' && token === activeToken) {
      signedOut = true;
    }
  });
  globalThis.fetch = async () => new Promise((resolve) => {
    resolvePreviousRequest = resolve;
  });

  try {
    const previousRequest = customFetch('/api/mobile/sync', { responseType: 'json' });
    await new Promise((resolve) => setImmediate(resolve));

    activeToken = 'replacement-token';
    resolvePreviousRequest(invalidSessionResponse());

    await assert.rejects(previousRequest, /HTTP 401/);
    assert.equal(signedOut, false);
    assert.equal(activeToken, 'replacement-token');

    globalThis.fetch = async () => invalidSessionResponse();
    await assert.rejects(
      customFetch('/api/mobile/sync', { responseType: 'json' }),
      /HTTP 401/,
    );
    assert.equal(signedOut, true);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthFailureHandler(null);
    setAuthTokenGetter(null);
  }
});

test('keeps provider state changes scoped to the matching session token', () => {
  assert.match(
    providerSource,
    /token && token === activeTokenRef\.current[\s\S]*invalidateSession\(token\)/,
  );
  assert.match(providerSource, /sessionGenerationRef\.current !== invalidationGeneration/);
  assert.match(providerSource, /setSession\(true\)/);
  assert.match(providerSource, /setSession\(false\)/);
});