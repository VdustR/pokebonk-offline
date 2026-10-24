# Standard and Unlocked edition study

**Only Unlocked is implemented and published. Standard was evaluated and is not planned.** The user accepted dropping Standard when it requires substantial progression work. It needs a normal progression backend; disabling `unlock()` would not produce a working normal edition. Keep this study as the decision rationale, not a development commitment or pending TODO.

Use **Standard** for normal local progression and **Unlocked** for the existing unlock-all edition. Both would be offline adaptations, with online accounts, multiplayer, rankings, clans and server events still unavailable unless separately implemented. Neither name means an official distribution.

## Current implementation evidence

| Area | Existing behavior | Standard requirement |
| --- | --- | --- |
| Profile loading and saving | `loadProfile()` and `persist()` always apply every unlock and refill resources. | Load and preserve earned progress without unlock mutation. |
| Run completion | `finishRun()` stores real counters and recent runs but returns zero Stardust. | Establish and implement the actual reward calculation, caps, and anti-duplication behavior. |
| Shop and Lab | `buyItem()` and `buyLab()` persist without purchasing or debiting currency. | Validate catalog, eligibility, cost, balance and limits; apply purchases atomically. |
| Achievements and commissions | Patches mark rewards claimed and report completed progress for sandbox profiles. | Validate completion and grant each reward once, including period rollover. |
| Captures, evolution, research and map progression | Some run progress is merged, but all local catalogs are pre-unlocked on persistence. | Audit every upstream action/result path and preserve its progression semantics. |
| Unsupported online calls | A proxy throws an explicit unavailable-feature error. | Retain that boundary; normal progression must not depend on an unavailable server action. |

These findings come from `runtime/local-backend.ts`, `scripts/patch-game.ts`, and their existing tests. The original server's full progression rules have not been reconstructed or exercised. A generic empty profile is not evidence of a working progression loop.

## Design considerations if revisited

Share the collector, assets, renderer patches, native shell and release workflow. Select an edition at build time through a validated `standard | unlocked` contract, and place progression mutations behind separate backend policies. Avoid branching scattered UI code or offering a switch that can silently turn a normal save into an unlocked save.

Publish both editions under the same upstream/offline release identity, with edition-specific download filenames and explicit metadata. Build gameplay/progression acceptance independently for each edition before publication.

Keep existing Unlocked installation identities unchanged to preserve updates and saves. A future Standard edition needs a distinct Android application ID, desktop bundle ID, explicit user-data directory and save-key namespace. A different desktop bundle ID alone must not be assumed to isolate Electron user data. Android application IDs identify installed apps; Electron documents the userData path separately: [Android application IDs](https://developer.android.com/build/configure-app-module), [Electron application paths](https://www.electronjs.org/docs/latest/api/app#appgetpathname).

Existing Unlocked profiles already contain every reward and cannot be reliably converted into legitimately earned Standard progress. Start Standard with a separate save. Any future import/export or one-way Standard-to-Unlocked copy must be explicit, preserve the source save, and avoid overwriting an existing destination. No migration is implemented by this release.

## Revisit gate (no work scheduled)

Use an isolated Standard save to complete one loop: choose a starter, finish a run, receive the verified reward, purchase one upgrade, reload, and confirm the balance/upgrade and single-claim invariants. Add insufficient-funds and duplicate-claim controls. Do not build and publish a second set of binaries until that loop and the remaining progression contracts are verified.
