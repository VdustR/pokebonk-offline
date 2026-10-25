# Desktop fullscreen

The game's menu button and settings switch use the HTML Fullscreen API. The old Electron F11 handler used BrowserWindow.setFullScreen directly, so a working F11 shortcut did not establish that the game controls worked. Shell shortcuts now use the same HTML API; a native-only fullscreen window can still be exited by the shortcut.

## Permission repair

The desktop shell previously allowed only pointerLock. Electron 45.0.0 treats fullscreen as a separate permission ([versioned API reference](https://github.com/electron/electron/blob/v45.0.0/docs/api/session.md#sessetpermissionrequesthandlerhandler)). Both handlers now allow pointerLock and fullscreen only for the main frame at pokebonk://game, with the WebContents also on that origin. Child frames, other origins, automatic-fullscreen, keyboardLock, location, notifications and other capabilities retain the default denial. The upstream controls, fullscreenchange listeners and game pause lifecycle are unchanged.

Restoring the existing Fullscreen API permission is preferable to replacing the game controls with a native IPC bridge: it preserves document.fullscreenElement, control labels and upstream resize handling without adding a preload API or patching downloaded code.

## Reproduction and observed facts

Run `pnpm repro:fullscreen`. It launches the production shell with a tiny local fixture and a disposable user-data directory, then destroys the window and removes the directory in finally. It exercises a trusted user action, verifies the document fullscreen element, native fullscreen state and screen dimensions, exits, and checks child-frame/foreign-origin denial plus location/notification denial. Finally it restores the old deny policy only inside the test process and verifies fullscreen cannot be acquired again. CI runs the same probe under Xvfb.

Observed on 2026-10-25 (Asia/Taipei), macOS arm64, Electron 45.0.0, starting from repository revision 0876b56:

- Before the fix, the main-frame request did not enter fullscreen. The request promise and fullscreenerror event did not settle within the probe window, so denial must not be inferred only from promise rejection.
- With fullscreen allowed, the fixture entered and exited fullscreen. document.fullscreenElement, native BrowserWindow.isFullScreen() and screen dimensions agreed.
- Restoring the original deny policy prevented acquisition again. A same-origin child frame with allowfullscreen and a foreign data: document also could not acquire fullscreen; geolocation and notifications remained denied.
- macOS native fullscreen transitions are asynchronous. A second action before the enter-full-screen event can leave the probe waiting for exit. The test waits for the actual native transition before issuing the exit action and bounds transition waits. Early exploratory runs were inconclusive for exit; the completed probe passed one full cycle.

Machine-readable output is written to evidence/fullscreen.json. These observations establish the native permission boundary on this Mac; they do not establish physical behavior on Windows, Linux or Android. Rerun when Electron, the permission policy, OS fullscreen behavior or the upstream fullscreen implementation changes. Full-game and packaged-app verification are recorded separately from this fixture.

The negative-control run against emitted desktop code with only the fullscreen allowance removed failed with `pending-timeout` instead of `entered`; restoring the emitted production code retained the passing probe. The raw diagnostic is kept locally at evidence/fullscreen-original-policy.txt. This avoids changing checked-in source or the user's installed application's permissions for a control.

Full-game acceptance on upstream 0.8.47/build mvnpa0xv passed both the menu button and Settings > Controls switch, including entering, exiting and updated control state. The final fixture also passed an F11 cycle through Electron's native input API. macOS titlebar green-button fullscreen remains an OS-owned native mode; the shell shortcut can leave that mode without claiming it sets document.fullscreenElement.
