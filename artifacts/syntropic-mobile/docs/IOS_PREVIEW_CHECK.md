# iPhone preview handoff check

Run this check immediately before an iPhone tester session:

```sh
pnpm --filter @workspace/syntropic-mobile run check:ios-preview
```

The command uses `REPLIT_EXPO_DEV_DOMAIN` from the active Expo workflow. To
check another public preview explicitly, pass its HTTPS endpoint without
credentials:

```sh
pnpm --filter @workspace/syntropic-mobile run check:ios-preview \
  -- --url https://<public-expo-domain>
```

## What it proves

The check makes two requests to the public Expo endpoint:

1. It requests the endpoint with `Expo-Platform: ios` and
   `Accept: application/expo+json`, then parses the response as Expo JSON.
2. It resolves `launchAsset.url` from that manifest, fetches it, and requires a
   non-empty JavaScript bundle response.

The result is safe to paste into a release record. It reports only HTTP status,
aggregate bundle size, and URL origin/path. It never prints response bodies,
query strings, manifest metadata, credentials, or environment variable values.

## Interpreting a failure

- `iOS preview handoff failed [launcher/manifest]` means the QR/launcher path,
  content negotiation, manifest, or launch asset is unavailable. Refresh the
  Replit **Preview on your phone** QR code and rerun this check before asking a
  tester to scan it.
- A passing check proves the handoff and bundle download, not that JavaScript
  successfully runs on an iPhone. If Expo Go opens the bundle and then shows a
  red screen, crashes, or fails while rendering, record that separately as a
  `[javascript-runtime]` failure and inspect the Expo/Metro runtime logs.

Do not use a copied browser URL as the iPhone handoff. Use the fresh Expo Go
QR/`exp://` path shown by Replit after this check passes.