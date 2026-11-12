# Local run saves and recovery

The reviewed 0.8.86 game writes manual saves to `pb.runsave.local-sandbox`
and autosaves to `pb.runauto.local-sandbox`. Each envelope contains the run
ticket, serialized save, and SHA-256 digest. The local adapter validates the
identity, digest, schema version, and consumed objects before allowing resume.
Invalid envelopes reject without replacing the profile or deleting the save.
The game remains responsible for serializing and restoring its simulation.

## Progress and interruption boundaries

Resuming a run does not award progress. The game reconstructs its in-memory
progress against the pre-run profile, then submits a cumulative report at
settlement. The adapter stores the settled ticket ID and updated profile in
one localStorage value before removing checkpoints. Retrying after a failed
profile write retains the checkpoint; retrying after interrupted cleanup does
not award that run twice. Settlement IDs survive the 30-record display limit.
Unknown profile fields remain intact.

A suspended manual save keeps a local settlement fallback. Startup defers
abandoned-checkpoint settlement while a manual save or autosave is available,
so it cannot consume progress before the player chooses recovery. Declining
autosave recovery removes the upstream autosave and settles the last local
checkpoint once. Active recovered runs defer background settlement.

This follows the existing single-profile localStorage adapter and requires no
new database or dependency. The adapter assumes a single writer per profile;
the native shell currently does not enforce a single-instance lock. It does not
coordinate concurrent processes or independently modified copies of a profile.
Errors surfaced by the storage API remain observable; Chromium can also fall
back to memory without throwing, as described below. This does not promise
recovery after a disk or operating-system failure destroys the storage itself.

## Online capabilities

Cloud download, server-save discovery and stash synchronization are absent
optional capabilities. Upload reports failure so the game's existing notice
correctly describes a save retained only on this device. Local build plans and
archive presets keep their existing account-independent storage keys. Unknown
online/co-op methods still reject explicitly; no network permission is added.

## Verification

`test/backend.test.ts` exercises suspension, repeated recovery, declined recovery,
invalid envelopes, profile-write failures, cleanup failures, preserved fields and
unavailable online capabilities. `e2e/run-save-checks.ts` uses the actual pause
screen to save and exit, terminates/restarts the native process on its disposable
profile, resumes through the visible dialog, and settles. It also forces the
real autosave checkpoint producer before process loss and verifies recovery and
that settled saves are not offered again. Real user-profile preservation is a
separate release/install gate.

Recovery acceptance gives the trusted Continue click and restored-scene check
one 120-second deadline, preserving the previous combined 30-second click and
90-second scene allowance. Electron's input acknowledgment can wait behind the
game's synchronous scene construction; `noWaitAfter` skips navigation waiting,
not input acknowledgment. A production-shell control with a 35-second synchronous
click handler reproduces the old 30-second timeout even though its trusted click
restores the scene. Acceptance still requires the dialog to disappear, a playable
or paused simulation, resumed time progression, and exactly-once settlement.
This addresses input timing, not missing storage after restart.

Run `pnpm build && node e2e/recovery-click-budget.ts` to repeat the old/fixed/old
native control and reject a delivered click that never restores. On Linux, run
the Node command through `bash e2e/with-linux-desktop.sh`. It uses a disposable
minimal page, asserts a trusted click in each case, and writes
`evidence/recovery-click-budget.json`.

If startup changes the saved blob, acceptance records the pre-restart and
post-startup save, profile and pending-settlement values in
`evidence/electron-run-save-failure.json`, then preserves the original failure.
The snapshots use the existing storage-read calls; the evidence file is written
only after a mismatch, so diagnostics do not delay the shutdown under test.
These values come only from disposable acceptance profiles. A mismatch alone
does not establish whether storage loss or application cleanup caused it.

On a native acceptance failure, `evidence/electron-storage-failure.json` also
records the requested and actual session paths, Linux storage file descriptors,
and available disk space. It retains initial native paths from the existing
security-preference probe and process exit status at each `app.close()` return,
without adding an exit wait to the restart path. After the original native close
sequence and confirmed process exit, acceptance copies its own disposable storage
database and preference files to `evidence/electron-cold-profile/`. It never copies a different native
profile path. Capture errors are reported without replacing the original test
failure. Failure-time storage paths and cold copies are collected only after failure.

After the gameplay checks, acceptance retains the original writer's Chromium
storage key and `Storage.*` histograms in memory. On failure it captures the
current process's matching diagnostics in the same evidence file. The original
process's counters cannot be reconstructed after it exits. This observation
precedes the save scenarios and may affect timing; it is not a storage repair.
The actual restart sequence and saved-blob equality remain unchanged.

With Electron 45 / Chromium 156, a controlled LevelDB lock produced the same
`pokebonk://game/` storage key but disk-open errors and
`Storage.LocalStorage.OpenDatabase.InMemory` plus
`Storage.LocalStorage.Recovery.OpenFailure` histograms. Releasing the lock
restored the original disk values. A healthy control recorded successful
on-disk open/read counters instead. These counters distinguish this mechanism
from healthy disk storage; a normal session path or an empty JavaScript error
list does not. The historical CI profile resets lack these counters and a cold
database, so their cause remains unconfirmed. Do not infer that they were lock
failures or repair them by clearing data.

This behavior matches the pinned Chromium source: database-open failure can
[recreate storage or fall back to memory](https://github.com/chromium/chromium/blob/156.0.8078.48/components/services/storage/dom_storage/local_storage_impl.cc),
while a map-read failure can
[detach persistence while leaving the storage area functional](https://github.com/chromium/chromium/blob/156.0.8078.48/components/services/storage/dom_storage/storage_area_impl.cc).
Neither source establishes which path the historical CI failures took.

Startup validates existing recovery envelopes before exposing a playable profile
or persisting normalization. A damaged or incompatible save therefore cannot be
silently replaced by starting another run. Known durable settlements are
reconciled during startup when their ticket remains readable, even if the stale save payload was damaged
after settlement.

The existing startup failure screen uses a local-data explanation for this
backend, keeps its Retry action, and does not claim that progress is stored on
a server. The HTTP backend retains the upstream connection message. Native
acceptance injects a corrupt autosave on its disposable profile, restarts the
process, checks this explanation and blocked gameplay, and compares every raw
storage value.
