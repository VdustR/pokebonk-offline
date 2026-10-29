# Upstream snapshots and synchronization

Ordinary builds read only the verified snapshot committed at `vendor/pokebonk/`. Upstream game-site availability is required only for synchronization. When that site is unavailable, builder changes and packaging can continue with the previous captured version; previously uncaptured game updates must wait.

## Input contract

`game/` contains pristine upstream files. `snapshot.json` records the schema, origin, upstream build/version, every path/size/SHA-256, missing optional candidates and an inventory digest. Preparation verifies this digest, duplicate/path boundaries, regular-file ownership and every file hash before patching. The upstream HTML and configuration must agree with the recorded identity. A malformed or incomplete snapshot stops the build.

Generated output receives the current builder commit, source digest, offline version and runtime patches. None of that builder-specific output is committed as upstream input. The builder fingerprint includes the snapshot manifest, making its file hashes part of release provenance. Git attributes disable newline conversion for snapshot bytes.

The initial snapshot is upstream 0.8.78, build `mvtnhtpk`: 3,021 raw files, including all 971 animated sprite sheets. The resulting offline payload has 3,022 files and is approximately 89.2 MiB. An experimental Git pack of the representative payload was 70.6 MiB; the largest individual file was 2.3 MiB. All 736 font files had identical bytes across two observed builds despite changed paths. Ordinary Git is used initially. Git LFS would add object-download and quota dependencies without a current per-file size need; reassess from measured history growth. [GitHub documents LFS quotas and Actions bandwidth accounting](https://docs.github.com/en/billing/concepts/product-billing/git-lfs).

## Workflow ownership

1. **Acquire:** Every six hours, a read-only job checks the upstream identity. An unchanged build does nothing. A changed build is collected into an isolated candidate, with per-build download caches and bounded body-aware retries. Failure leaves the committed snapshot unchanged.
2. **Validate:** The reusable build workflow prepares that exact candidate with fetch disabled, verifies all payload hashes/catalogs, and runs the same native and platform checks as ordinary CI. Candidate builds cannot publish releases or receive Android signing secrets.
3. **Commit:** A separate writer downloads the candidate and compares it with the digest returned by validation. It processes bytes/JSON only; it never evaluates upstream modules or installs dependencies. It commits only the vendored snapshot and uses a normal push to `main`. Concurrent main updates or branch protection cause the push to fail instead of overwriting work.
4. **Release:** After the snapshot commit, the writer explicitly dispatches the ordinary release workflow. The resulting build checks out a coherent Git commit and regenerates all release provenance before publication. [GitHub documents why a token push needs an explicit workflow dispatch](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

The sync writer has repository/action write permissions. Acquisition and candidate execution retain read-only repository access. The writer validates the exact tested digest before any Git write, preventing artifact replacement between validation and commit from changing the accepted bytes.

## Local work

```sh
pnpm install --frozen-lockfile
pnpm prepare:game
node scripts/verify-game.ts
```

These steps use the committed game input. The toolchain and native packaging dependencies still come from their normal registries when they are not installed.

To stage an upstream update:

```sh
pnpm sync:upstream
pnpm prepare:game build/game cache/upstream-candidate
node scripts/verify-game.ts
```

Inspect and validate the candidate before promotion. `promote-upstream.ts` requires its validated digest; the scheduled workflow supplies the digest from the completed platform validation. Do not hand-edit generated snapshot files.

## Verification and limits

On macOS, an actual process sandbox denying network access made the previous downloader fail and allowed the new offline preparation to generate and verify all 3,022 payload files. A portable fetch-denial regression checks ordinary preparation and planning, and a failed-sync regression retains its previous candidate. Tests also reject corrupt bytes, duplicate/traversal paths, symlinks, mismatched identities and a candidate changed after validation. A Git probe verifies byte preservation even with automatic CRLF conversion enabled.

This proves the checked snapshot and known asset families, not every future upstream resource scheme or physical device. The scheduled workflow's live no-op/update behavior and the final published assets require separate GitHub readback.
