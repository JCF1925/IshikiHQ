---
name: Axe animation settling
description: Accessibility contrast scans can observe transitional opacity instead of the final rendered colors.
---

Browser accessibility scans should wait for the app's initial motion transitions to settle before evaluating color contrast.

**Why:** Axe can calculate contrast from semi-transparent animation frames, producing serious violations for otherwise compliant text and controls.

**How to apply:** Keep the wait localized to the accessibility scan helper, or emulate reduced motion when the behavior under test does not itself require animation.