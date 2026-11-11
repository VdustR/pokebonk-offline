# Linux minimize smoke precondition

The real-game fullscreen smoke test asserts that minimizing a running, pointer-locked game releases capture and pauses the run. A newly acquired lock is not enough: the bundled upstream input ignores user unlocks when `unlockAt - lockedAt < 700`. The shared `waitForPauseEligibleCapture` helper requires canvas capture, `run.state === 'play'`, acknowledgment by the game's input consumer, and an acquisition clock newer than its last release. It then waits for 700 ms on that clock and for the upstream resume grace period to expire (800 ms normally, 1,500 ms after a modal). The existing pause, restore-keeps-paused, and resume-reacquires assertions retain their timeouts.

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

## Restore completion before resumed input

The 0.9.23 candidate's packaged Linux smoke reached paused gameplay after minimization, then timed out when resuming capture. The artifact recorded a ready boot and no renderer exceptions, but did not record native window focus, so the unique hosted failure's exact timing remains unproven.

A controlled Ubuntu 24.04 amd64/Openbox/Electron 45 probe delayed the actual native restore by 400 ms. DOM focus remained true while the native window was minimized and both the window and its web contents were unfocused. The original restore/focus/DOM-wait ordering dispatched resume in that state and failed capture. Waiting for native restoration and then acquiring both native focus states passed; repeating the original ordering failed again. This establishes a test precondition defect without changing the upstream game's input behavior.

`restoreNativeInput` waits for the [Electron 45 restore event and minimized state](https://github.com/electron/electron/blob/v45.0.0/docs/api/base-window.md#event-restore), then uses the existing window/web-contents focus helper. The original paused-state and pointer reacquisition assertions and their timeouts remain intact. Failure evidence now includes native minimized and focus states.

`e2e/restore-input.ts` isolates this boundary with a small local pointer-lock fixture through the development shell's production window/permission code. It repeats delayed native restoration twice, asserts native readiness separately from successful capture, and rejects a permanently withheld restore. The development fullscreen smoke invokes it before gameplay checks. Packaged apps intentionally ignore alternate game directories, so packaged acceptance exercises the same restore helper through the complete bundled game instead. The fixture rejects packaged mode explicitly.

```sh
CI=1 bash e2e/with-linux-desktop.sh node e2e/restore-input.ts
# Linux negative control: expected to fail native-readiness/capture assertions.
RESTORE_CHECK_DOM_ONLY=1 CI=1 bash e2e/with-linux-desktop.sh node e2e/restore-input.ts
```

The maintained fixture passed both positive trials and withheld-restore rejection on macOS arm64 and on emulated Ubuntu amd64. The original-order Linux control failed with native minimized/unfocused state and absent pointer capture. The four-trial initial full-game experiment completed fail/pass/fail for restore, but its fourth trial timed out earlier at the separate minimize/pause prerequisite; that trial supplies no restore conclusion. Full hosted platform acceptance remains required.

Packaged acceptance also establishes native window and web-contents focus before its first trusted gameplay key and verifies native focus at the minimize request. A local macOS package reproduced an initial capture timeout while native focus was absent; the focused flow passed. The isolated fixture's API accepts no packaged executable, and checks `app.isPackaged === false`, preserving the packaged shell's intentional refusal to load an alternate game directory.

Menu labels have a separate asynchronous boundary: the upstream fullscreen-change callback updates the button after DOM/native fullscreen state can already change. The smoke waits up to five seconds for its nonempty entered label and restored initial label, then keeps the original assertions. A current-build native control delayed only that real label listener by 1.5 seconds; both transitions passed with the waits, while a permanently withheld label update still rejected. Repeating the delayed control passed again. No label, input or pause behavior is patched in the distributed game.

## Input acknowledgment before measuring capture age

The [main publication attempt](https://github.com/VdustR/pokebonk-offline/actions/runs/43058951330)
failed the original minimize-to-pause assertion on upstream 0.9.23/build
`mwaj5w8h`, using the
[source before this repair](https://github.com/VdustR/pokebonk-offline/commit/1740d86d1be78a070451e025fa5d963f2db62ba4).
Native minimization completed, boot was ready, and no startup exceptions were
recorded. That artifact lacks input clocks and run state, so it does not establish
the unique hosted event's cause.

A subsequent native Ubuntu 24.04 amd64/Openbox/Electron 45 probe observed DOM
canvas capture while the game's input still held an older `lockedAt`, preceding
its last `unlockAt`. The old 700 ms condition passed using that previous capture.
The actual acquisition consumer updated its clock about 48 ms later, followed by
native release about 2 ms later; the upstream flicker guard correctly kept play.
A separate attempt to isolate the 800 ms resume window released at 806 ms and
was excluded from the negative comparison. The resume guard itself is present
with the same 800/1,500 ms semantics in both reviewed 0.9.22 and 0.9.23 sources.

The maintained native probe adds acquisition-acknowledgment controls:

```sh
# Empty executable argument selects the development shell.
CI=1 bash e2e/with-linux-desktop.sh node e2e/minimize-game.ts '' ack-resume-only ack-stable ack-resume-only ack-stable
```

These modes delay only the actual game's pointer-lock acquisition consumer by
1,300 ms, assert that exactly one known consumer was selected, and forward its
original callback. Actual pointer acquisition, native minimization and release,
upstream pause behavior, and restoration remain real. Every trial uses disposable
user data. The original immediate/stable modes remain available without this
delay. This isolates the consumer ordering; it does not claim that the hosted
failure had the artificial delay.

Repeated resume-only/eligible/resume-only/eligible trials observed unacknowledged DOM
capture and continued play in both resume-only controls, then acknowledged capture and
paused/restored-paused states in both eligible cases. The eligible trials also
asserted actual release ages of at least 700 ms and expiration of the resume
window. Mechanism assertions are separate from pause outcomes. The resume-only control waits for the known resume guard but still uses the old
capture-age condition. The delay exceeds that guard, so waiting for resume alone
cannot make the case pass accidentally. Legacy controls report an older recorded
clock, not the duration of the current physical lock. The original old condition
is also available as `ack-legacy`. The development CI job runs the repeated
resume-only/eligible comparison before platform packaging.

The fullscreen smoke and stable probe now share this eligibility decision.
Failure evidence records input clocks, acknowledgment, pointer/run state and
resume origin both before minimization and after failure. The original pause,
restore-keeps-paused and reacquisition assertions retain their deadlines. No
production input behavior or pause callback is changed, and the probe never
substitutes a forced pause for the expected native-minimize outcome. Required
current-head platform CI and exact-source release acceptance remain separate
integration gates.

Local acceptance passed the normal macOS and Linux fullscreen/minimize/restore
flow, the original immediate/stable controls, and the integrated Linux entry with
all four resume-only/eligible cases. A separate check mounted the prepared game
at an alternate path with no default game directory and passed an eligible trial;
the integrated controls receive the caller's selected game directory. Type
checking, 60 compiler probes and 105 unit/regression tests passed. Only test and
evidence files changed; the packaged-source identity and offline version remain
unchanged. Hosted current-head and main publication gates are still required.
