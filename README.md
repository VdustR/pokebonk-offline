# PokéBonk Offline

Unofficial, fully bundled [PokéBonk](https://pokebonk.com/) unlock-all apps for Electron desktop and Android. All game resources ship inside each package, saves stay local, and the game runs without an account or internet connection. There is no PWA, service worker, or Pages deployment.

## Download and play

Download your platform's archive or APK from [Releases](https://github.com/VdustR/pokebonk-offline/releases). `SHA256SUMS.txt` verifies every download.

| Package | Platform |
| --- | --- |
| `pokebonk-darwin-arm64-*.zip` | Apple Silicon Mac, macOS 13+ |
| `pokebonk-darwin-x64-*.zip` | Intel Mac, macOS 13+ |
| `pokebonk-win32-x64-*.zip` | Windows 10+ x64 |
| `pokebonk-linux-x64-*.tar.gz` | Linux x64 with Electron's system dependencies |
| `pokebonk-android.apk` | Android 8+ with a WebGL-capable Android System WebView |

Extract desktop archives and launch the included app. Install the APK on Android. Desktop builds are not commercially signed; macOS apps have verified ad-hoc signatures and are not notarized. The operating system may require user approval when first opening a download.

Android updates use the same dedicated signing certificate and application ID, allowing APK updates without uninstalling. Keep the existing app installed to retain its data. Electron updates retain the same app name, storage origin, and user-data directory.

Android follows the game's responsive landscape viewport, using the [WebView wide-viewport support](https://developer.android.com/develop/ui/views/layout/webapps/targeting) needed to match Chrome scaling. Use the game's settings to adjust HUD size, touch-button size, minimap size, and camera distance. Display-cutout padding remains active to keep controls clear of the camera area.

## Unlocks and scope

The current catalogs supply every League member, maximum Lab upgrades, every shop item, character looks and cosmetics, all achievements with their title/mastery-look rewards, one billion Stardust, and 999 of each preparation item. Supported maps have every difficulty and champion medal. Daily and weekly commissions are completed and claimed when loading or saving, including after a period changes.

Unlocks apply to both new and existing native-app saves. Actual run counters, recent results, selected character, equipped look, and preferences retain their values. Future-season maps without implemented gameplay stay unavailable. Online accounts, multiplayer, clans, social features, mail, and rankings remain unavailable; visible online entry points can show a local unsupported-feature message.

The former PWA's browser data is separate from Electron and Android app storage. Changing the distribution does not delete that browser data or modify an official account, but it does not automatically migrate browser saves into the native apps. Uninstalling an app or deleting its data can remove its local save.

## Build and verify

Node.js 24.12+ and pnpm 10.33.2 are required. Electron 45.0.0 and Electron Packager 20.3.0 are pinned. Android uses the checked-in Gradle wrapper, JDK 17+, Android SDK 36, and build-tools 36.0.0. The native shells reference [VdustR/pokerogue-offline](https://github.com/VdustR/pokerogue-offline/tree/5207e18f9986717824b30cef01c034a6e46db4a3).

```sh
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm typecheck
pnpm test:types
pnpm test
pnpm prepare:game
node scripts/verify-game.ts
pnpm e2e:electron
pnpm package:electron build/game release darwin arm64
pnpm stage:android
cd android
./gradlew --no-daemon assembleDebug assembleRelease lintRelease
```

Maintained tools, tests, Electron code, and the browser backend use TypeScript 7.0.2 with `@tsconfig/strictest` and application-scoped `ts-reset`. See [TypeScript boundaries and verification](docs/typescript.md) for the environment split, runtime emission, coverage gate, and incremental-cache limitation.

A loopback static preview is available with `pnpm preview` for debugging. It is not an installable PWA. Native runtime tests use a temporary Electron user-data directory; a packaged executable can be supplied as the second argument to `e2e/electron.ts`.

To test an installed debug APK on a connected emulator or device:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
ANDROID_FULL_GAMEPLAY=1 pnpm e2e:android <adb-serial>
```

Release WebViews disable debugging. Do not replace an installed release APK with a debug APK: their signatures differ. The debug test validates unlocks, resource loading, local persistence, and optionally five representative gameplay scenarios. Emulator evidence does not establish physical-device behavior.

## Automatic releases

CI checks the upstream game build and builder revision on main changes, pull requests, manual dispatch, and every six hours. A fully published matching Release skips collection, tests, packaging, and publication. Changed identities build every platform and publish only after the verification jobs pass. Pull requests never receive signing secrets or publish Releases.

The collector follows the game module/CSS graph and current catalogs. Semantic patching fails on incompatible upstream structures. Payload manifests verify each bundled file's SHA-256 and length. Status badges are collected from the real status-effect catalog as mandatory images. Runtime checks decode every status icon and display an afflicted boss, alongside complete local resource access, all unlock categories, persisted saves, and four maps plus the Halloween tower. These are representative checks rather than exhaustive coverage of every event or physical device.

Electron serves only the bundled custom origin with Node integration disabled, context isolation and sandboxing enabled, and runtime HTTP/HTTPS/WebSocket requests blocked. Android serves bundled assets through a local HTTPS WebView origin and requests no `INTERNET` permission. These follow the [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and Android's [local-content model](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).

Android signing passwords remain in GitHub Actions secrets. `android/signing-certificate.sha256` pins the public certificate fingerprint so a different signing key fails publication. Every Release contains four desktop archives, one signed APK, and checksums. An incomplete draft can be resumed; it is never treated as a completed update.

## Attribution

Builder code uses the included AGPL-3.0 license. Native packaging references the user's PokéRogue offline project; PokéBonk's game code and assets are fetched at build time, retain their original rights, and are not covered by the builder license or tracked in Git.

Credit goes to Charcher and the original contributors. Pokémon names and assets belong to their respective owners; the game's credits and legal page remain included. This is an unofficial, noncommercial personal build with no affiliation or endorsement.
