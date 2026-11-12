# Upstream snapshots and synchronization

Ordinary builds read only the verified snapshot committed at `vendor/pokebonk/`. Upstream game-site availability is required only for synchronization. When that site is unavailable, builder changes and packaging can continue with the previous captured version; previously uncaptured game updates must wait.

## Input contract

`game/` contains pristine upstream files. `snapshot.json` records the schema, origin, upstream build/version, every path/size/SHA-256, missing optional candidates and an inventory digest. Preparation verifies this digest, duplicate/path boundaries, regular-file ownership and every file hash before patching. The upstream HTML and configuration must agree with the recorded identity. A malformed snapshot stops the build. Its inventory alone does not establish resource completeness. The independent [resource contract](resource-completeness.md) requires the accepted resource paths and rejects changed upstream inputs until dependency review.

Generated output receives the current builder commit, source digest, offline version and runtime patches. None of that builder-specific output is committed as upstream input. The builder fingerprint includes the snapshot manifest, making its file hashes part of release provenance. Git attributes disable newline conversion for snapshot bytes.

The initial snapshot is upstream 0.8.78, build `mvtnhtpk`: 3,021 raw files, including all 971 animated sprite sheets. The resulting offline payload has 3,022 files and is approximately 89.2 MiB. An experimental Git pack of the representative payload was 70.6 MiB; the largest individual file was 2.3 MiB. All 736 font files had identical bytes across two observed builds despite changed paths. Ordinary Git is used initially. Git LFS would add object-download and quota dependencies without a current per-file size need; reassess from measured history growth. [GitHub documents LFS quotas and Actions bandwidth accounting](https://docs.github.com/en/billing/concepts/product-billing/git-lfs).

## Workflow ownership

1. **Detect:** The daily/manual [version-issue workflow](upstream-version-issues.md) reports an available build. This is the only Actions workflow; it cannot acquire, promote or publish game files.
2. **Review and acquire locally:** Complete the resource dependency review, then collect the exact reviewed build into an isolated candidate with bounded retries and the existing per-build cache. Failure preserves the committed snapshot.
3. **Validate and commit locally:** Prepare the candidate with upstream network access disabled and verify its payload. Promote only the validated snapshot digest, review the diff and commit through the normal PR workflow. Do not evaluate downloaded game modules in a privileged writer.
4. **Release locally:** From the merged main commit, run the [local release command](local-release.md). It regenerates provenance, verifies the packaged app and complete artifact set, then publishes. No push triggers an automatic release.

## Local work

```sh
pnpm install --frozen-lockfile
pnpm prepare:game
node scripts/verify-game.ts
```

These steps use the committed game input. The toolchain and native packaging dependencies still come from their normal registries when they are not installed.

After completing the [resource dependency review](resource-completeness.md#reviewing-an-upstream-update), stage an upstream update:

```sh
pnpm sync:upstream
pnpm prepare:game build/game cache/upstream-candidate
node scripts/verify-game.ts
```

Inspect and validate the candidate before promotion. `promote-upstream.ts` requires its validated digest; use the digest printed by the candidate validation, and retain that evidence with the PR. Do not hand-edit generated snapshot files.

## Verification and limits

Upstream 0.8.79 introduced a boot host predicate that accepts the official site and local development hosts. Preparation extends only that call with the existing Electron `pokebonk://game/` and Android `https://appassets.androidplatform.net/` asset URLs. The website predicate remains intact, including rejection of unrelated mirrors. The patch recognizes the predicate semantically and rejects unsupported shapes; older entries without hostname inspection remain byte-identical. Native origins stay unchanged to retain Web Storage. Android's asset URL follows the [documented local-content origin](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).

The native fullscreen smoke check installs boot observers before reloading. If the module entry completes or fails without a local profile, it records the body, URL, boot state and renderer exceptions instead of waiting for profile readiness until timeout. The original 0.8.79 candidate reproduced the refusal, the adapted candidate reached its local menu, and restoring the original entry reproduced the refusal again.

On macOS, an actual process sandbox denying network access made the previous downloader fail and allowed the new offline preparation to generate and verify all 3,022 payload files. A portable fetch-denial regression checks ordinary preparation and planning, and a failed-sync regression retains its previous candidate. Tests also reject corrupt bytes, duplicate/traversal paths, symlinks, mismatched identities and a candidate changed after validation. A Git probe verifies byte preservation even with automatic CRLF conversion enabled.

This proves the checked snapshot and known asset families, not every future upstream resource scheme or physical device. The scheduled reporter and final published assets require separate GitHub readback.

### Native map input compatibility

Upstream 0.8.83 (`mvv70wso`) mangles the run's private `openMap` method. The
[failed candidate validation](https://github.com/VdustR/pokebonk-offline/actions/runs/41139366935)
reached gameplay without renderer errors or missing resources, then failed when
the smoke test called that method directly. The same candidate reproduced the
failure locally; opening and closing the map with `KeyM` passed, and restoring
the direct call reproduced the failure again.

The shared native gameplay check now uses the player's map shortcut through
[Playwright keyboard input](https://playwright.dev/docs/api/class-keyboard#keyboard-press).
It requires the visible `.bigmap`, paused gameplay and released pointer lock,
then requires the map to close, gameplay to resume and pointer lock to return.
This also works with the captured 0.8.80 input handler, which uses the same
shortcut. It avoids adding a production alias for a minified private method.
Unknown future input or DOM changes still fail validation before promotion;
this does not guarantee compatibility with arbitrary future upstream builds.
