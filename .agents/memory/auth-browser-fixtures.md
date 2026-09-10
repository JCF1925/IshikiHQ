---
name: Auth browser fixtures
description: Isolating post-sign-in navigation in browser tests without weakening auth coverage.
---

Auth browser tests that mock the Auth.js client response must stub the final protected destination document when no real session cookie is issued.

**Why:** A successful mocked credentials response still leaves protected server routes unauthenticated, so the application correctly redirects back to login and can hide whether the callback path was preserved.

**How to apply:** Keep the signup form and Auth.js client requests real, and stub only the expected final local path in the browser fixture.