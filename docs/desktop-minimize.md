# Linux minimize smoke precondition

The real-game fullscreen smoke test asserts that minimizing a running, pointer-locked game releases capture and pauses the run. A newly acquired lock is not enough: the bundled upstream input ignores user unlocks when `unlockAt - lockedAt < 700`. The test now waits for canvas capture, `run.state === 'play'`, and at least 700 ms on the actual input's `lockedAt` clock before native minimization. The existing pause, restore-keeps-paused, and resume-reacquires assertions retain their timeouts.

## Native probe

Prepare the game and Electron using the README's development commands, then on Linux with Openbox and Xvfb installed:

```sh
CI=1 bash e2e/with-linux-desktop.sh node e2e/minimize-game.ts
CI=1 bash e2e/with-linux-desktop.sh node e2e/minimize-game.ts '/path/to/Pokebonk Offline'
```

The optional executable must contain the matching prepared game. The probe uses fresh temporary user data for each trial, starts a real run, waits for play, releases capture through the game's existing input method, then reacquires it through a trusted `w` key. This isolates the lock-age guard from the separate initial transition and resume guards. An actual pointer-lock acquisition event triggers native `BrowserWindow.minimize()` in the immediate case; the stable case waits for the input's acquisition age. No synthetic OS events or forced pause are used.

Default order is immediate, stable, immediate, stable. Each trial asserts native minimized state, actual release/acquisition age, pointer release, the game's flicker result and run state, and preserved state after restore. A missed timing target fails rather than retrying. JSON under `evidence/minimize/` records native events/state with wall time, DOM pointer/focus/visibility, renderer monotonic time, input timestamps and run state. The bounded observation delay does not replace or lengthen the full-game smoke assertion. Temporary user data and app windows are closed in `finally`.

## Observed mechanism

On 2026-11-07 (Asia/Taipei), base source `fa3311b5f4a1d793e103b418eff647a2e273e537`, upstream 0.9.13/build `mw41iu0i`, Electron 45.0.0, Node 24.22.2, Ubuntu 24.04 amd64/Openbox 3.6.1 via OrbStack x64 emulation on macOS ARM64:

| Trial | Actual acquisition to release | Native minimized | Flicker | State after minimize / restore |
| --- | ---: | --- | --- | --- |
| Immediate | 25.6 ms | true | true | play / play |
| Stable | 745.4 ms | true | false | paused / paused |
| Immediate again | 41.1 ms | true | true | play / play |
| Stable again | 780.6 ms | true | false | paused / paused |

Every callback-time run was already in play. The same inputs with a stable-lock precondition pass the original pointer-null/paused expectation; removing that precondition in the repeated immediate case fails it again. This establishes a harness precondition mechanism, not a need to force production pause. An earlier first-lock experiment released during `transition`, which independently bypasses pause and was excluded from this causal comparison. Another initial experiment labeled immediate held capture for over ten seconds because startup had acquired it automatically; labels alone do not establish timing.

Native minimized/blurred state and DOM observations are separate evidence: this environment reported native invisible/unfocused while DOM focus remained true and visibility remained visible. Do not substitute a DOM visibility assertion for native minimization. Electron's [page visibility documentation](https://github.com/electron/electron/blob/v45.0.0/docs/api/browser-window.md#page-visibility) describes the expected mapping; these recorded values are the actual observation here.

The [original packaged Linux failure](https://github.com/VdustR/pokebonk-offline/actions/runs/42155828212/job/127695110543) and [investigation issue](https://github.com/VdustR/pokebonk-offline/issues/36), including its retry comment, establish intermittency. Original artifact `13475303620` was downloaded before expiry and verified as SHA-256 `f0a71270356c7336ffd82b819ccfb4b6cc77a93cc010cc3582689de82a2accbb`; it shows boot ready, no startup errors, unlocked gameplay and no pause menu. It lacks acquisition/release times, native state and final run state, so this investigation cannot prove that unique historical event had the same cause. Retry artifact `13476431323` is separate evidence.

These measurements establish Linux/Openbox behavior in an emulated x64 environment. They do not establish physical hardware input, other window managers, Windows, macOS or Android behavior. Re-run when upstream input guards, Electron/Chromium, OS/window manager or focus sequence changes. Keep the packaged full-game smoke and adjacent Escape/map/resume checks as integration acceptance.

## Packaged acceptance

The maintained TypeScript probe also passed all four cases against a Linux x64 package built from the same source and prepared payload: 68.1 ms / play, 826.7 ms / paused, 50.7 ms / play, and 790.9 ms / paused. Native minimized state and pointer release were asserted in every case; the recorded states at both the minimize request and release were play. Restore preserved each resulting state.

The unchanged full-game fullscreen flow passed menu/settings enter/exit, native minimize release/pause, restore-keeps-paused and resume-reacquires capture. Full type checking, 60 compiler probes and 105 unit tests passed. The test/documentation changes leave the packaged-source digest unchanged; the release policy therefore retains the current offline version and requires no new binary.

The packaged forest integration also passed native pointer capture, camera movement, Escape pause, resume reacquisition, map release/pause and map-close reacquisition, plus a live persisted checkpoint. These checks retain the adjacent pause behavior independently of the stable-minimize probe.
