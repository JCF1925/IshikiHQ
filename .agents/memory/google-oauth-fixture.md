---
name: Controlled Google OAuth fixture
description: Auth.js acceptance tests need a generic OAuth fixture provider to avoid Google’s OpenID token requirements.
---

Use a test-only provider with the `google` id when an acceptance flow must exercise the real Google sign-in button without contacting Google. The Google-specific provider can still route a non-live token response through OpenID Connect and require an `id_token`, even when the fixture requests only profile and email scopes.

**Why:** The controlled token and userinfo endpoints intentionally do not create or sign Google ID tokens; the generic OAuth path validates the callback, PKCE cookie, token exchange, and profile mapping without live Google dependencies.

**How to apply:** Gate the provider and local endpoints behind the fixture environment flag, keep production on `Google(...)`, and run the browser on the same host used in the OAuth callback so PKCE cookies are not lost.