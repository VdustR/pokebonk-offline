# Upstream version issue reporting

The daily version check reports new upstream builds in one reusable issue. It does not download game assets, promote a snapshot, or publish a release. The manual snapshot-sync workflow retains its independent resource-review gate.

## Identity and ownership

The production workflow pins the canonical tracker number in `UPSTREAM_UPDATE_ISSUE`. It directly reads that issue, including when it is closed, updates its managed status block, and reopens it for another upstream build. When the accepted snapshot matches the official version and build, it closes the tracker as completed. A repeat with identical status makes no mutation or comment.

Only the repository owner or `github-actions[bot]` may own a tracker. Pull requests and unrelated issues are excluded. The HTML start/end markers delimit the automation-owned block; notes outside it and all discussion comments are preserved. Missing, malformed, inaccessible, or replaced pinned issues fail visibly instead of creating another issue.

The workflow runs daily at 01:41 UTC (09:41 Asia/Taipei) and supports manual dispatch on main. Its concurrency group serializes supported workflow invocations. It receives only `contents: read` and `issues: write`; upstream discovery parses JavaScript syntax without executing downloaded modules. Network, identity, and GitHub API errors fail the check. Successfully reporting an available update is a successful check.

## Bootstrap and recovery

Bootstrap is an explicit setup operation, not a scheduled fallback:

```sh
GITHUB_REPOSITORY=owner/repository node scripts/report-upstream-update.ts --bootstrap
```

It enumerates every page of open and closed issues, selects an existing owned marker, or creates one if a new upstream build needs tracking. Record the returned issue number in the workflow before enabling the schedule. Normal execution requires that number. Do not blindly retry bootstrap after an uncertain creation response: inspect the repository and recover the existing issue identity first.

If the pinned issue is deleted or its ownership/markers are changed, restore the known tracker or deliberately select a replacement through a reviewed configuration change. Automatic creation from a failed lookup would defeat the no-duplicates invariant.

## Real Actions evidence

The private [integration playground](https://github.com/vp-playground/pokebonk-version-issue-ci) uses isolated fixture issues and the production reporter sources.

A [list-consistency probe](https://github.com/vp-playground/pokebonk-version-issue-ci/actions/runs/42149817049) created an issue that immediate REST list calls did not return, even with a no-cache header and a fresh query parameter. An earlier list-only reporter consequently created a duplicate. This establishes an observed stale-list window, not its undocumented backend cause. Pinning the tracker makes that list freshness irrelevant to scheduled execution.

GitHub's [issue API](https://docs.github.com/en/rest/issues/issues), [token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), and [workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) supply the transport, least-permission boundary, and serialized entry point. An existing create-from-file action still needs a caller-supplied issue identity and replaces whole content; the small reporter uses the runner's existing GitHub CLI to preserve the managed block and closed-issue lifecycle without adding a package or action dependency.

Unit checks cover creation, repeat no-op, newer versions and same-version hotfixes, closed-issue reuse, preservation, pinned stale-list behavior, pagination, unrelated/untrusted records, malformed trackers, API failures, and a lost creation response. Live tests separately exercise the Actions token and pinned issue mutations. Natural schedule timing and arbitrary external writers are not guaranteed by the workflow serialization.

The [production-source lifecycle suite](https://github.com/vp-playground/pokebonk-version-issue-ci/actions/runs/42151166938) passed repeat-without-write, pinned closed-issue reuse, human-note/comment preservation, current-version closure, and reopen for the next update. Two [concurrent](https://github.com/vp-playground/pokebonk-version-issue-ci/actions/runs/42151642004) [dispatches](https://github.com/vp-playground/pokebonk-version-issue-ci/actions/runs/42151646509) completed serially and kept one canonical tracker. The tested reporter, identity, and data-parser files matched production source hashes.
