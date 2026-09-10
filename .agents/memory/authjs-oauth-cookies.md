---
name: Auth.js OAuth cookies
description: Cookie configuration rule for Google OAuth behind the Replit preview proxy.
---

Let Auth.js choose its default secure OAuth cookie names for PKCE and state. Do not override those names with unprefixed custom cookies in this application.

**Why:** Auth.js encrypts these short-lived cookies with the configured secret and derives their salt from the cookie name. Old or mismatched custom verifier cookies can make a normal OAuth callback fall through to the generic server-configuration error even when the provider and public callback URL are correct.

**How to apply:** Keep the public development origin configured for Auth.js, but leave OAuth cookie naming and secure-prefix behavior to Auth.js. Route recoverable OAuth errors back to the product login page.