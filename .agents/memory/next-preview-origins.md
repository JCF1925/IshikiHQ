---
name: Next preview hydration
description: Diagnostic lesson for apparently loaded but non-interactive proxied previews
---

A proxied preview can return valid HTML while its client-side application never hydrates.

**Why:** A preview can return valid HTML while Next.js rejects client chunk requests from an unlisted proxy origin. The page then looks present but never hydrates, so interactive flows such as login silently fail.

**How to apply:** When a preview renders but does not respond, inspect browser logs and client chunk responses before debugging application logic. Treat a successful HTML response as insufficient proof that the UI is running.