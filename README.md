# PokéBonk Offline

Private, unofficial unlock-all builds of [PokéBonk](https://pokebonk.com/), with a pure frontend SPA shared by Electron desktop apps and an Android WebView app. No game backend is needed. Saves stay in each browser or app's local storage.

## Downloads

Use this repository's [Releases](https://github.com/VdustR/pokebonk-offline/releases).

| Artifact | Use |
| --- | --- |
| `pokebonk-spa.zip` | Extract and serve with any static HTTP server, at a dedicated origin or subdirectory. ES modules require HTTP; `file://` is unsupported. |
| `pokebonk-darwin-arm64-*.zip` | Apple Silicon macOS app. Extract and open the app. |
| `pokebonk-darwin-x64-*.zip` | Intel macOS app. |
| `pokebonk-win32-x64-*.zip` | Windows x64 app; extract the entire directory and launch its executable. |
| `pokebonk-linux-x64-*.tar.gz` | Linux x64 app; extract and launch its executable. |
| `pokebonk-android.apk` | Android 8.0+ APK. Subsequent releases use the same signing key for updates. |

macOS apps use ad-hoc signatures, not Developer ID signing or notarization. Use macOS's per-app Open Anyway flow if Gatekeeper blocks an app you have verified. Windows binaries are not Authenticode-signed. `SHA256SUMS.txt` verifies download integrity.

## Local progression

Supported game catalogs determine the unlocks: every League member, maximum Lab upgrades, all purchasable item unlocks, shiny/classic/mastery/spectral character looks, one billion Stardust, and 999 of each initial preparation item. Unlocks are reapplied on profile load and save. Unavailable future-season maps remain unavailable.

Preferences, selected character, and recent run results persist locally. App data and browser saves are separate; clearing site data or uninstalling can erase them. No official account or save is imported or edited. Online multiplayer, clans, social features, mail, and rankings are unavailable. Their original UI entry points may remain visible and return a local unsupported-feature message.

## Build and preview

Requirements: Node.js 24, pnpm 10.33.2. Android also needs JDK 17+, Android SDK 36, and build-tools 36.0.0. macOS signing checks require macOS.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm prepare:game
node scripts/verify-game.mjs
node scripts/serve.mjs
```

The preview binds `127.0.0.1:8098`, or `PORT`. With Portless installed, use `portless pokebonk-offline node scripts/serve.mjs` for a stable local URL. This server serves only static files; it has no save, account, or gameplay API.

```sh
pnpm e2e:electron
pnpm package:electron build/game release darwin arm64
pnpm stage:android
./android/gradlew -p android --no-daemon assembleRelease lintRelease
```

The Android command produces an unsigned release APK locally. CI signs it using this repository's dedicated key. Electron packaging accepts `darwin`, `win32`, or `linux`, with `arm64` or `x64`; CI publishes the four desktop targets listed above.

## Automatic updates and verification

The workflow runs on main changes, pull requests, manual dispatch, and every six hours. It compares the game's build identifier and builder commit against published Releases. Unchanged identities skip payload downloads and builds.

Changed builds must pass semantic patch checks, local-save tests, payload SHA-256 verification, offline Electron gameplay checks, packaged Linux/native macOS smoke tests, Android compilation/lint, and APK signing. Only then does the final job publish all six artifacts and checksums. Pull requests validate without publishing or reading signing secrets. Unknown upstream structures or missing required resources fail the build instead of publishing an assumed-compatible app.

The collector follows published module/CSS dependencies and game catalogs, then downloads runtime data, sprites, models, maps, music, fonts, and cosmetics into ignored build output. Optional candidates that the upstream site does not serve are recorded in `asset-manifest.json`; any missing resource actually requested during gameplay smoke tests fails publication. Smoke coverage is representative, not exhaustive coverage of every late-game event or Android device.

Desktop apps use a private standard protocol, Node integration disabled, context isolation and renderer sandboxing enabled, and HTTP/HTTPS/WebSocket requests blocked. Android embeds the same payload under a local HTTPS origin and requests no INTERNET permission. The SPA applies a same-origin CSP and never uses the official account backend. A hosted SPA still needs its static host; this version does not pre-cache the entire game with a service worker.

## Signing

The release job requires repository Actions secrets named `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Use a dedicated, backed-up key. Losing that key prevents compatible APK updates. Never commit keys or passwords.

## Attribution

Electron/Android shells and macOS signature tooling are adapted from [VdustR/pokerogue-offline](https://github.com/VdustR/pokerogue-offline/tree/5207e18f9986717824b30cef01c034a6e46db4a3), under AGPL-3.0. This repository's builder code uses the included AGPL-3.0 license. Gradle wrapper files retain Apache-2.0 notices.

PokéBonk's game code and resources are fetched at build time, retain their original rights, and are not covered by the builder license or tracked in Git. Credit goes to Charcher and the original contributors. Pokémon names and assets belong to their respective owners. This is an unofficial, noncommercial personal build with no affiliation or endorsement. Repository visibility is private; the workflow does not publish a public website or public asset mirror.
