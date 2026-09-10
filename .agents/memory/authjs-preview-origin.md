---
name: Auth.js preview origin
description: OAuth callback origin behavior behind the Replit development proxy.
---

In development, configure Auth.js with the public HTTPS Replit preview origin rather than relying only on forwarded host detection.

**Why:** The proxy can expose the internal server bind address to Auth.js, causing Google authorization requests to use an invalid `0.0.0.0` callback even when the request entered through the public preview domain.

**How to apply:** Keep development auth URL environment values aligned with the current Replit preview origin, restart the web workflow after changing them, and verify the generated provider authorization URL contains the exact public callback registered with Google. When a proxied test uses an alias, preserve only the callback URL's relative path, query, and hash rather than comparing origins. For recovery redirects built from request URLs, emit a relative Location so an internal bind address cannot leak into the browser. Generic Auth.js Configuration and CallbackRouteError responses can otherwise return an absolute login URL and omit the callback destination; normalize those responses from the Auth.js callback cookie as well.