---
name: Expo preview content negotiation
description: How Replit Expo preview domains distinguish native manifest requests from ordinary web requests.
---

Replit Expo development domains are content-negotiated. A plain HTTPS request can return the web preview shell, while a native request with `Expo-Platform: ios` and `Accept: application/expo+json` returns the Expo manifest. Adding `?platform=ios` to the `exp://` URL also forces manifest output when an iOS handoff omits Expo headers. Validate the manifest’s launch asset as a separate iOS bundle request.

For remote SDK 57 previews, Expo Go and Expo CLI must also identify as the exact same normal Expo username. A Replit-managed account, an anonymous CLI session, or an access token represented as `username (robot)` will all fail the account check even when they belong to the expected user. Use a normal CLI session, keep credentials in protected Secrets during setup, and never ask testers to sign into Replit’s private managed Expo account.

**Why:** A plain handoff can show “Failed to parse manifest JSON” even when Metro is healthy. Fixing negotiation can then reveal Expo’s separate account-matching gate.

**How to apply:** When an iPhone preview fails before rendering, check the header-negotiated manifest, `?platform=ios`, and its `launchAsset`. Inspect `extra.expoGo.username` and compare it exactly with Expo Go before debugging app runtime.