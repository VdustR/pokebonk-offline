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
new database or dependency. The native application uses one instance per
profile. It does not coordinate two independently modified copies of a profile.
Storage errors remain observable; this does not promise recovery after a disk
or operating-system failure destroys the storage itself.

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
