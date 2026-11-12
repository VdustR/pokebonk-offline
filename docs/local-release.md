# Local release procedure

Actions only reports upstream versions. A local macOS checkout owns acquisition,
validation, packaging and publication. The default command publishes all four
desktop archives and one signed APK, plus `release-info.json` and `SHA256SUMS.txt`.

## Prerequisites

- A full-history, clean checkout, Node 24.12+ or 26+, pnpm 10.33.2 and dependencies
  installed from the lockfile. Use `pnpm install --frozen-lockfile` when needed.
- macOS with `codesign`, `ditto`, `zip` and `tar`; at least 8 GiB free for staging.
- An existing JDK 17+ in `JAVA_HOME`, Android SDK in `ANDROID_HOME`, SDK platform
  36 and Build Tools 36.0.0. Signing remains ad hoc on Mac, not notarized.
- The original Android keystore in `POKEBONK_ANDROID_KEYSTORE`, with
  `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` supplied by the existing
  project secret provider. The pinned certificate must match; do not create a
  replacement key. Existing project-owned dotenv storage can be supplied with
  Node's `--env-file` option without printing or copying its contents. For a
  configured fnox provider, use `fnox exec --redact --only ANDROID_KEYSTORE_PASSWORD,ANDROID_KEY_PASSWORD -- pnpm release:local`.
- `gh` authenticated to the intended personal account with repository release
  access. The command uses that existing authentication; it does not export a token.

## Prepare and publish

1. Review upstream input changes using [the resource boundary](resource-completeness.md).
   Check identity with `node scripts/check-upstream.ts`, then run
   `EXPECTED_BUILD=<reviewed-build> pnpm sync:upstream`. Prepare the candidate with
   `node --import ./test/no-upstream-network.ts scripts/prepare-game.ts build/game cache/upstream-candidate`
   and run `node scripts/verify-game.ts`. Promote the verified digest with
   `node scripts/promote-upstream.ts cache/upstream-candidate vendor/pokebonk <validated-digest>`.
2. Apply any required Changeset and commit the reviewed source. Use
   `pnpm release:local prepare` to validate a PR before integration. This creates
   local artifacts and a receipt; it never publishes.
3. Integrate the reviewed change and synchronize to the exact current main
   commit. Run `pnpm release:local`. It checks types, compiler probes and unit
   tests, prepares and verifies the committed offline payload, builds every
   package, and runs the packaged native Mac acceptance once. Disposable saves
   exercise manual/autosave restart, recovery, settlement and corrupt-data handling.
   When integration preserves the exact prepared commit (a normal fast-forward),
   the command reuses that receipt after checking source identity and all artifact
   hashes. It does not rerun unchanged acceptance. A squash or other new commit
   needs newly prepared provenance. A concurrent main update stops publication.
4. The command compares the Android version code against the actual latest
   published APK. Full-history main commit counts produce monotonically increasing
   codes above the migration floor. Preserve main history; repeated or lower codes
   fail before publication.
5. After all checks succeed, the command rechecks main, source cleanliness and
   every artifact hash. It uploads a draft, verifies all seven GitHub asset digests,
   then publishes as Latest and reads the result back. Existing public assets are
   never overwritten. Interrupted draft publication can resume with
   `pnpm release:local publish` from the same source commit and local receipt.

Artifacts live in `release/<tag>-<commit-prefix>/`; the acceptance receipt,
Android verification and publication readback live under the corresponding
`cache/local-release/` directory. A failed preparation retains its evidence;
move its owned output directory aside before a deliberate rerun. The receipt
is written only after acceptance succeeds. A new source commit needs new
provenance and a new prepared artifact set.

The packaged Mac test uses the package's embedded game and a disposable profile.
Windows, Linux, Intel Mac when it is not the host, and physical Android behavior
are not established by this run. Their package identities are verified; APK
signing, version code and absence of the Internet permission are checked.
Broader native controls remain available for changes affecting those boundaries.

## Bounded failure handling

A passing local release check permits publication. A historical, unreproduced
failure is recorded with available evidence; unknown cause alone is not a
release blocker and does not justify a speculative production patch.

For an anomaly without a current reproduction, allow at most two focused
experiments or 30 minutes of additional investigation, whichever comes first.
This is a work budget, not proof that a defect cannot recur. Count all model
switches, hypotheses, batches and waits toward the same budget. Each experiment
must change a named implementation or delivery decision; unchanged full-suite
retries are not an investigation plan.

At the limit, stop and choose a disposition: repair a supported defect, defer
the unreproduced observation, or request a concrete decision for credible material
harm. Reopen only for a matching new failure or concrete new evidence. A current
reproducible failure, signature mismatch, incomplete package or corrupted payload
still prevents publication, even before its root cause is known.

## Install and recover

Install only the verified public archive. Before replacing the user's app,
save and quit normally, take a cold profile backup outside the worktree, retain
the previous app, and verify that replacement leaves the profile bytes unchanged
before first launch. Confirm the new version and existing saved run without
resuming or discarding it. Publication and installation are separate acceptance
steps; a built ZIP alone completes neither.
