---
name: Local Expo Apple modules
description: The CocoaPods/autolinking requirement for local Expo modules with native Apple source.
---

A local Expo module that exposes Swift on Apple platforms must include a top-level podspec in its package directory. `expo-module.config.json` registers the native class, but the Apple autolinker skips the module when it cannot find a podspec.

**Why:** Expo’s Apple resolver only emits modules that have at least one podspec, so a tracked Swift file can still be absent from the generated development target.

**How to apply:** When adding a local module under an app’s modules directory, verify the Apple autolinking output contains both the pod and the configured Swift module class.