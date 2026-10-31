# CI artifact transfers

Artifact Actions own their JavaScript runtime. Changing the application's
`setup-node` version does not change an action's `runs.using` declaration.

The build, upstream synchronization and release workflows pin these official
Node.js 24 actions to full commit SHAs:

| Action | Release | Commit |
| --- | --- | --- |
| `actions/upload-artifact` | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | [Pinned upload source](https://github.com/actions/upload-artifact/commit/cf430e030ddbb5b0abf93d22962f4752f3646cd9) |
| `actions/download-artifact` | [v8.0.2](https://github.com/actions/download-artifact/releases/tag/v8.0.2) | [Pinned download source](https://github.com/actions/download-artifact/commit/9000827ccba6bdab643e8b6fd33ac0654aef8333) |

The Node.js 24 releases require Actions Runner 2.327.1 or later. The repository's
hosted Ubuntu and macOS jobs reported 2.338.2 during the October 31, 2026 upgrade.
See the [upload runtime migration](https://github.com/actions/upload-artifact/releases/tag/v6.0.0)
and [download runtime migration](https://github.com/actions/download-artifact/releases/tag/v7.0.0).

## Transfer contract

Keep the default archived upload behavior. The opt-in direct-file mode ignores
artifact names and only accepts one file, which does not fit the game and
candidate directory inventories. Named downloads extract directly into their
requested path; multiple downloads retain separate artifact-name directories.
Existing retention, compression, hidden-file and extraction inputs remain
unchanged.

Download v8 defaults to failing on digest mismatch rather than warning. Keep
that default and the independent snapshot/payload manifest checks. The new
[download behavior](https://github.com/actions/download-artifact/releases/tag/v8.0.0)
also recognizes non-ZIP direct uploads; these workflows continue to upload ZIP
archives and extract them normally. The ESM implementation requires no caller
code changes.

## Upgrade evidence

The [small hosted-runner transfer check](https://github.com/VdustR/pokebonk-offline/actions/runs/41156169687)
passed on Ubuntu and macOS before production references changed. It uploaded
nested filenames, binary bytes and an inner ZIP, then compared exact bytes and
paths after named and multiple downloads. Neither artifact Node 20 annotations
nor `url.parse()` deprecations appeared in that check. Its temporary branch-only
workflow was removed after the check; it adds no recurring CI job.

Full PR CI still validates payload integrity, native gameplay and each desktop
and Android target. Main release CI additionally exercises download-all and
publication. Check current-head annotations and raw logs after upgrades;
changing a version string or hiding warnings does not establish recovery.
