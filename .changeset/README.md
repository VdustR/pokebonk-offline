# Changesets

This private application uses Changesets for the offline builder version and changelog, not npm publication.

For a packaged code/dependency/native-shell change, run `pnpm changeset`, describe the user-visible effect, then run `pnpm version:release` before delivery. Review the resulting version and CHANGELOG.md with the source change. Pending Changeset files stop release planning. Documentation-only and test-only changes do not need a new offline version.

Upstream game version/build and offline builder version are independent. See [release versioning](../docs/release-versioning.md).
