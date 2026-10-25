# Desktop integration audit

Scope: Electron desktop shell interactions in the offline app. This audit covers the reported fullscreen and close failures plus adjacent native lifecycle boundaries. It does not claim physical Windows/Intel Mac/Android acceptance.

## Findings and repairs

| Interaction | Finding | Decision |
| --- | --- | --- |
| Game fullscreen button/settings switch | Confirmed: fullscreen permission denied by the shell | Permit only the bundled main frame; retain the game's HTML API and fullscreenchange state |
| F11 | Confirmed code-path mismatch: native fullscreen changed without document.fullscreenElement | Use the same HTML API as game controls; ignore key repeats; exit a native-only fullscreen window when necessary |
| Close during an active run | Confirmed in real Chromium beforeunload fixture: close canceled with no native decision | Show a parented native confirmation; Keep Playing is default and Escape/cancel; only Close Game overrides beforeunload |
| Idle close | No game protection is needed | Preserve ordinary close, without a confirmation |
| Close/Quit shortcuts and application menu | Confirmed: Menu.setApplicationMenu(null) removed standard application commands | Restore native App/File/Edit/View/Window roles, including explicit Close and Quit where appropriate |
| Reopen after closing the last Mac window | Existing activate handler creates a fresh window | Retain native Mac lifecycle and the same storage origin/profile |
| External navigation, new windows and network | Deliberately denied by the offline distribution | Preserve denial; no external-browser launch or online capability added |
| Pointer capture, Escape, pause/map/resume | Existing ownership belongs to the upstream input system | Retain existing implementation and rerun the real pointer-lock regression |
| Focus/minimize/restore and hidden audio | Upstream listens to focus/visibility and pointer-lock release | Exercise the remaining native integration path; avoid a second competing pause state machine |

## Close contract

A live run registers beforeunload; completed/dead runs and the menu do not block close. Electron 45 silently cancels a prevented unload unless the app handles will-prevent-unload. The native dialog explicitly warns that the current unfinished run will end. Previously saved progress and settings are retained; continuing the current run after restart is not promised. Local keepLive writes a pending result, but hasPending returns false, so a pending result must not be described as a resumable save.

The repair follows Electron's [versioned will-prevent-unload example](https://github.com/electron/electron/blob/v45.0.0/docs/api/web-contents.md#event-will-prevent-unload) and [close behavior](https://github.com/electron/electron/blob/v45.0.0/docs/api/browser-window.md#event-close). It keeps beforeunload rather than globally suppressing it or force-destroying real user windows. Test teardown may destroy disposable windows to avoid prompting for synthetic runs.

## Reproduction and evidence

`pnpm repro:window-lifecycle` runs the production shell with a tiny beforeunload fixture, using a disposable profile. It replaces only dialog decision input; Chromium unload dispatch, the production handler, native menu structure, close, activation and localStorage persistence are real. It checks cancel/confirm, quit cancellation, idle close and reopening. A stubbed decision is not evidence of the visible native dialog; that acceptance is separate.

On 2026-10-25 (Asia/Taipei), macOS 26.6.2 arm64 and Electron 45.0.0, the original shell reached will-prevent-unload but presented zero confirmations and left the window open. The failure is retained locally at evidence/window-close-original-policy.txt. Fullscreen evidence and recheck conditions are in [desktop fullscreen](desktop-fullscreen.md).

Rerun the affected probes when Electron, native menu/close policy, OS lifecycle behavior or upstream beforeunload/input handling changes. Generated evidence files include observation timestamps and remain local/CI artifacts. The checked-in probes and this record preserve the premises independently of chat history.

Test adapter boundary: Playwright page.keyboard/CDP input did not dispatch the Mac native Close menu accelerator in this fixture, and calling MenuItem.click did not execute its native role. Those attempts are not evidence that the OS shortcut fails. Native shortcut acceptance uses the system UI separately. F11 coverage uses Electron webContents.sendInputEvent, which reaches the production before-input-event handler; the fullscreen probe passed both button and F11 enter/exit cycles.


Native macOS acceptance completed on the same date: a real titlebar close displayed the parented confirmation with Keep Playing focused; Escape canceled it. Native Command-W displayed the confirmation and Close Game closed the window. The activate handler reopened the game origin and retained localStorage. Native Command-Q displayed the confirmation and Close Game terminated the process. The temporary acceptance instance and profile were removed. Local machine-readable evidence: evidence/native-window-acceptance.json. This establishes native Mac input/dialog behavior, separately from the automated dialog-decision fixture.

Full-game integration also passed against upstream 0.8.47/build mvnpa0xv: menu fullscreen enter/exit and label restoration; Settings > Controls fullscreen switch enter/exit and switch state; minimizing an active keyboard/mouse run released pointer lock and paused; restoring retained pause; resuming reacquired real pointer lock. Evidence: evidence/fullscreen-game.json, fullscreen-game.png and fullscreen-settings.png. These checks used the production shell with a disposable profile, not the user's save.


To repeat visible Mac acceptance, run `pnpm build && node e2e/native-window-acceptance.ts` and follow its console stages: titlebar Close then Escape; Command-W then Close Game; after automatic reopening, Command-Q then Close Game. It checks window/process outcomes and storage readback and removes its disposable profile.
