# Upstream version issue reporting

The daily version check reports upstream builds. An open tracker represents one unresolved update. If a newer build arrives while that issue is open, the workflow updates its status block in place. When the accepted snapshot matches upstream, the workflow updates and closes the open tracker as completed.

A closed tracker stays as a record of the build it reported. Checking the same build again leaves it alone. A different upstream build starts a new issue, including a hotfix with the same version number and a different build ID. A repeated check with identical status makes no mutation or comment.

## Identity and ownership

The reporter finds the latest issue with the managed markers whose author is the repository owner or GitHub Actions bot. It also recognizes the existing tracker format, so an open tracker can continue through the migration. The HTML start/end markers delimit the automation-owned block. Edits preserve text outside it and existing comments. Ambiguous open trackers, malformed markers on the selected issue, and API errors fail visibly.

The workflow uses the [GraphQL repository issue connection](https://docs.github.com/en/graphql/reference/repos#repository) for discovery and the [REST issue API](https://docs.github.com/en/rest/issues/issues) to read the selected issue directly before deciding whether to edit, close, or create. Ordinary edits send only the body, so an edit cannot reopen an issue closed after the read. The reporter sends one create request per run. If the outcome is uncertain, check the repository for the new issue before manually retrying.

The workflow runs daily at 01:41 UTC (09:41 Asia/Taipei) and supports manual dispatch on main. A concurrency group serializes workflow invocations. The job has `contents: read` and `issues: write`. Upstream discovery parses JavaScript syntax without executing downloaded modules. Reporting a pending update is a successful check. The maintainer performs acquisition, resource review and publication through the [local release procedure](local-release.md); Actions does not build or publish binaries.

## Real Actions evidence

A [private playground probe](https://github.com/vp-playground/pokebonk-version-issue-ci/actions/runs/42149817049) observed that REST list calls could temporarily miss a newly created issue, even with a no-cache header and a fresh query parameter. The reporter uses GraphQL discovery to avoid the observed REST list behavior. GitHub does not document a read-after-write guarantee for issue discovery. Workflow serialization applies to this workflow's invocations and cannot coordinate manual edits or other writers.

The [rollover lifecycle run](https://github.com/vp-playground/pokebonk-version-issue-ci/actions/runs/42734593743) exercised the production reporter source with the Actions token. It verified immediate rediscovery after creation, updates to the same open issue, preservation of notes and comments, no changes to the closed issue when the same build was checked again, a new issue for a subsequent build, and closure when the accepted snapshot caught up.
