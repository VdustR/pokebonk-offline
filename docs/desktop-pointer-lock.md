# Desktop pointer lock

Keyboard/mouse gameplay follows the bundled upstream game's Pointer Lock API lifecycle. While the game holds the canvas lock, the cursor is hidden and relative mouse movement rotates the camera. The native shell must permit this request rather than forcing the upstream drag-to-look fallback.

The game owns when to acquire and release the lock. Pausing with Escape, opening the map or other upstream modal flows, and leaving gameplay must retain upstream behavior. Resuming can require a user gesture and Chromium's post-Escape cooldown. Do not hide the cursor with CSS or immediately re-lock after Escape: neither restores the relative-input contract or preserves user control. Touch/controller behavior is unchanged.

## Permission boundary

Both Electron permission handlers allow only `pointerLock`, requested by the main frame of `pokebonk://game`, while its WebContents is also on that origin. Child frames and other origins are denied, as are other capabilities. Runtime HTTP, HTTPS and WebSocket requests remain blocked; sandboxing, context isolation and disabled Node integration remain enabled.

This is a native permission repair. It deliberately leaves the downloaded game's input and modal state machines intact. Electron documents the [permission request and check handlers](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler), including `pointerLock`; the installed Electron 45.0.0 declarations supply the callback contracts used here.

## Re-runnable minimal reproduction

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec install-electron
pnpm repro:pointer-lock
```

On headless Linux, run the last command through `xvfb-run -a` with `CI=1`. The probe serves a tiny local page through the production Electron shell's real custom origin and requests native pointer lock through a click, matching upstream raw-input requests and its `NotSupportedError` fallback. The test first focuses its own window and waits for document focus. It asserts acquisition, explicit release, child-frame and foreign-origin denial, and continued denial of geolocation/notifications. Finally it reinstates the original deny-all handlers in its isolated process and asserts that the same main-frame request fails again. Failure exits nonzero. Temporary game files and user data are removed and Electron is closed in `finally`; successful run metadata is written to ignored `evidence/pointer-lock.json`.

Observed 2026-10-25 (Asia/Taipei), macOS Apple Silicon, Node 26.12.1, Electron 45.0.0, base source `d9dd83c518e13fc45d93dec6f2667eb7ee7939ba`:

- Original production policy: `Pointer lock result: denied`, assertion `denied !== locked`.
- Scoped permission fix: `Pointer lock result: locked`; acquisition/release checks pass.
- Original-policy control after the fix: request denied again.
- Same-origin child frame, foreign origin, geolocation and notification checks remain denied.

The collected PokéBonk 0.8.47 build `mvnpa0xv` also passed the forest lock/camera/Escape/resume/map assertions and all five gameplay scenarios locally. An earlier run did not acquire a lock; focus contention was not ruled out, and the observation alone does not establish its cause. The automation explicitly establishes document focus before testing.

This establishes that the deny-all permission policy prevents native pointer lock in this environment. It does not establish every upstream gameplay transition or physical mouse feel. Recheck this premise when Electron/Chromium, the permission handlers, custom origin, platform or focus/gesture sequence changes, or when contradictory evidence appears.

## Integration acceptance

`pnpm e2e:electron` tests the real collected game with temporary saves. The forest run uses trusted keyboard input to acquire capture and asserts canvas pointer lock, a camera yaw change after mouse movement, release and pause on Escape, reacquisition on resume, release for the map, and reacquisition after closing it. The same checks run against packaged Linux and native macOS apps in CI. Existing gameplay, persistence, image decoding and network-isolation checks remain required.

For a local installed app, verify its packaged provenance and signature, and run the same packaged Electron checks. For physical acceptance, enter keyboard/mouse gameplay, confirm that moving the mouse continuously rotates the view without reaching a screen edge, then verify Escape, map and resume. DOM lock/yaw assertions establish native lock state and game response; they do not substitute for observing physical cursor visibility or subjective input feel. Windows and Intel Mac physical acceptance remain separate from source or Apple Silicon runtime evidence.

### Automation hit-testing observation

The first macOS arm64 packaged CI run reached active forest gameplay but timed out in `locator('canvas').click()`: Playwright reported that the HTML root intercepted pointer events. The failure artifact showed gameplay continuing into a level-up modal during retries. The same head passed Linux packaged input/gameplay checks. See the [initial macOS CI run](https://github.com/VdustR/pokebonk-offline/actions/runs/40193048981).

Acquisition tests use a trusted `w` key press, which upstream already handles for keyboard/mouse capture. A local tiny body-lock probe accepted a second element click, so the observation does not establish a generic Electron hit-testing defect. The keyboard path avoids making an element hit-test a precondition while native pointer lock may already be active, and still asserts real canvas lock and camera response. The production permission change remains unchanged.
