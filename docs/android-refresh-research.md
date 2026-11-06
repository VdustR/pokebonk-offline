# Android resource and refresh-rate checks

Observed November 6, 2026 (Asia/Taipei). These are APK inspection, HTTP
comparison, and isolated game-logic results. **No Android hardware benchmark was
performed.**

## Environment

- Host: macOS, arm64; Node.js 26.13.0 and the repository's Acorn dependency.
- Android tools: SDK Build Tools 36.0.0 (`aapt`, `apksigner`, `dexdump`);
  API 35 stubs inspected with `javap`.
- Game: vendored PokéBonk 0.9.13, build `mw41iu0i`, at the
  [reviewed Offline 0.0.22 source](https://github.com/VdustR/pokebonk-offline/commit/bbee0c3e58e0dd3628e5f711a5e7f5f64dcd85ea).
- Official artifact: `PokeBonk-1.0.1-android.apk` from the
  [official app release](https://github.com/CharcherGit/pokebonk-app/releases/tag/v1.4.0).
  APK version 1.0.1 is the wrapper version, not the game version.
- No ADB device was connected. No emulator was started, APK installed, or
  existing application data changed.

## Checks and results

**APK:** the 4,860,426-byte download matched GitHub's SHA-256 digest:
`b6b5438387ebbd0ca925dd613fec3f0a7fdf2c72c0bbc3295f84dc67df81aebe`.
Signature verification passed. ZIP inspection found a Capacitor shell configured
with `server.url = https://pokebonk.com`, a blank 103-byte entry page, and a
connection-error page. It contained no game models, audio, or game data.

**HTTP:** one entry-page request per desktop, Android Chrome, and official
Android WebView User-Agent returned HTTP 200, the same build, and the same
13,175-byte HTML and script entry. HTML SHA-256:
`f00cdab5254eb4cead6d1cbcb30a85d444c5498a83cc26573c845d1c978dd078`.
This does not establish equivalence of every later request or runtime branch.

**Official native policy:** DEX inspection found selection of the highest
refresh mode at the current physical resolution, setting both window refresh
preferences. On API 35+, it also requests the WebView's HIGH frame-rate category.
The API and its `-4.0f` constant were checked against SDK stubs and the
[Android View reference](https://developer.android.com/reference/android/view/View#setRequestedFrameRate(float)).
This establishes the request, not the resulting panel rate or game FPS.

**Game scheduling:** Acorn extracted the actual FPS resolver and
`frameGap`/`fpsCap`/`fpsChosen` methods from the vendored modules. Executing them
with controlled settings passed all eight cases:

| Scenario | Returned FPS cap | Scheduled gap (ms) |
| --- | ---: | ---: |
| Touch default, saver off | 60 | 16.67 |
| Touch, implicit saver cap | 30 | 33.3 |
| Explicit 120 FPS | 120 | 8.33 |
| Explicit 60 FPS | 60 | 16.67 |
| Explicit 120 FPS with saver enabled | 120 | 8.33 |
| Explicit unlimited | 0 (uncapped) | 0 |
| Desktop default, saver off | 0 (uncapped) | 0 |
| Paused with implicit saver cap | 30 | 50 |

Source inspection also found that touch devices with a minimum screen dimension
below 600 CSS pixels default to saver mode. Explicit FPS selections bypass the
implicit saver cap. The table describes scheduling decisions, not measured
rendered FPS; forced redraws can bypass the normal skip.

## Decision and remaining measurement

Keep the reviewed web snapshot as the shared resource source: this APK adds no
independent game payload. Do not copy the maximum-refresh policy without device
data. Some Chromium WebView revisions already
[provide their own frame-rate hints](https://chromium.googlesource.com/chromium/src/+/16fc10c12bb1e9b0765328201ca5673bce964e1b/android_webview/java/src/org/chromium/android_webview/AwContents.java#4391),
depending on OS, WebView version, and feature configuration.

The next experiment should compare native hint off/on against game caps of
60/120 FPS on the same high-refresh device, build, disposable checkpoint, and
graphics settings. Record actual presentation/frame pacing, entity counts,
thermal behavior, and supported power measurements. Only proceed to sustained
trials if the short comparison shows repeatable game-frame improvement.

No physical refresh rate, presented FPS, input latency, temperature, or power
benefit has been measured. The proposed comparison has not run. No production
refresh policy or synchronization workflow was changed.
