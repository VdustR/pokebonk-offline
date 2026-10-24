# Release versions and provenance

Release titles show both independently managed versions: **PokéBonk 0.8.34 · Offline 0.0.1**. The upstream version describes the downloaded game; the offline version describes this builder and its native shells. Changesets manages the private builder package without publishing to npm.

| Change | Result |
| --- | --- |
| Offline code, dependencies, native shells, or packaging change | Add a Changeset and apply the next offline version before delivery. |
| Upstream publishes a new game build | Keep the offline version when the builder is unchanged; publish the new upstream version/build combination after all checks pass. |
| README, documentation, or tests only | Retain the current versions; do not publish another binary for an already published identity. |
| Same upstream version, different upstream build | Publish a distinct build identity; do not overwrite the earlier package. |

The tag is `upstream-v0.8.34-offline-v0.0.1-build-mvlr7rzv`. The build suffix distinguishes upstream hotfixes that reuse a version. GitHub's Latest flag is set explicitly only after all five binaries and their verification files are uploaded. The README links to `/releases/latest`; a descriptive tag is not used as a SemVer ordering rule.

## Prepare an offline release

```sh
pnpm changeset
pnpm version:release
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
```

Review the package version, generated `CHANGELOG.md`, consumed Changeset, and lockfile in the same PR. The build rejects pending Changeset files: version them before delivery. Changesets 3 exits with status 1 when there are no unreleased Changesets; the minimal private-app probe verified that this leaves the version unchanged. Do not run `changeset publish`: GitHub Actions owns native publication, and the package remains private.

Changesets is pinned at 3.0.3 with `privatePackages.version: true` and `privatePackages.tag: false`. See [Changesets beyond npm](https://changesets.dev/guide/beyond-npm) and [configuration](https://changesets.dev/guide/config). This repository uses Changesets' manual versioning workflow; adding a version-PR bot would be a separate workflow/access decision.

## Build identity and checks

The planner reads the official HTML build ID and follows same-origin JavaScript imports to find the catalog entry for that exact build. It does not take the first version in a changelog or hardcode the UI version. Missing, conflicting, unsafe, or unsupported mappings stop the build.

Each payload's `offline-build.json` records the upstream version/build, offline version, full builder Git SHA, packaged-source digest, and `unlock-all` variant. The SHA identifies this repository's source commit; it is not an upstream commit or the checksum of an APK. `SHA256SUMS.txt` identifies the actual download bytes, including `release-info.json`.

The source digest includes tracked and non-ignored source/tool/native/dependency/workflow inputs, but excludes documentation, tests, and generated files. A published identity with the same source digest is a no-op even when a documentation commit changed HEAD. Changed packaged source under an existing identity is rejected with an instruction to bump the offline version. A draft can be resumed only from its original source commit. HTTP/authentication errors and invalid existing provenance remain visible failures, not missing-release signals.

Electron's application version and Android's versionName use the offline version. Android's versionCode retains the existing monotonically increasing CI counter and the existing signing certificate. Application IDs, desktop names/user-data paths, and local save keys remain unchanged for the Unlocked edition.

Publication checks all platforms, creates a draft, uploads four desktop archives, a signed APK, checksums, and `release-info.json`, then publishes it as Latest. Existing legacy Releases and tags are preserved. See [GitHub's latest-release links](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases).

## Validation boundaries

Unit tests exercise exact upstream build/version selection, upstream hotfix identities, offline version changes, documentation-only source changes, missing and compatible draft releases, provenance/HTTP failures, and version-bump enforcement. Native CI verifies image decoding, representative gameplay, saves, network isolation and packaging. Published archive/APK metadata and checksums must still be read back after release; a green planner alone does not establish delivery.
