---
name: Expo notification platform guard
description: Expo notification response APIs are native-only even when the mobile artifact has a web preview.
---

Native Expo Notifications response APIs must be guarded with a platform check before registering listeners or reading the last response in a shared Expo app.

**Why:** The web preview can load the shared mobile route, but native-only response methods such as `getLastNotificationResponseAsync` can be undefined and crash the entire preview.

**How to apply:** Keep notification scheduling and response routing behind `Platform.OS !== 'web'`; allow the web preview to render without attempting native notification operations.