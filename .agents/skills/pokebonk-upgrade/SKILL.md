---
name: pokebonk-upgrade
description: Upgrade this repository's PokéBonk snapshot or maintain its offline acquisition and local release workflow. Use for resource review, adapter compatibility, release preparation/recovery, publication and requested device updates; ordinary unrelated game changes do not need this workflow.
---

# Pokebonk upgrade and release

Establish the user's endpoint: local preparation, merge, public release, and
installation are separate outcomes. Preserve authorization already granted;
this skill grants no additional publishing, installation or archival authority.

## Choose the work

- For upstream changes, read [resource completeness](../../../docs/resource-completeness.md)
  and [snapshot handling](../../../docs/upstream-snapshots.md). Detection alone
  does not capture or accept a snapshot. Trace changed URL producers and finite
  catalogs before acquisition, bind one build with `EXPECTED_BUILD`, and retain
  the discovery guard. Use isolated candidates and the verified promotion command.
- For release preparation or runner changes, read the
  [local release procedure](../../../docs/local-release.md). Do not acquire a
  newer upstream snapshot merely because the runner is being maintained.

## Verify without restarting the whole investigation

Use the smallest check that answers the current question: source/catalog tests,
a resource verification, or focused native reproduction. Include the newly
changed resource families and scenes. A passing old scene does not validate a
new producer. Preparation's source smoke finds problems before other-platform
packaging; full packaged acceptance still owns release readiness.

Run the existing preparation command from committed source. Its stage journal
owns cache validation and invalidation. On a late failure, inspect its failed
stage, timings and native diagnostic directory, then resume the same command
when new evidence or a correction justifies retrying. Follow the documented
anomaly investigation budget. Do not manufacture a final receipt, treat a partial
journal as publication authority, or broaden a caught error into global suppression.
A changed commit needs new provenance and preparation; the journal is not a
cross-commit cache.

For native failures, read the actual run state, failing URL and retained trace
before changing code. Context-level event collection survives page reloads.
Distinguish a confirmed cause from a paused screen, a generic timeout or a
passing retry. Do not auto-resume an unexpected pause to make acceptance pass.

## Deliver the requested endpoint

Before public release, require the complete acceptance receipt and the source,
artifact, signing, version-ordering and public readbacks in the release procedure.
A successful preparation is not a published release. A merge-only request stops
after verified integration and does not publish or update a device.

When installation is requested, use the verified public archive and follow the
cold-backup and first-launch checks in the release procedure. Test profiles are
disposable; the player's profile and saved run are not test fixtures. Respect an
app-access denial and the user's decision before retrying the affected UI action.

Report executed/reused stages and timings, the exact verified endpoint, preserved
results, and any remaining verification limits. Keep the source review and local
release documents authoritative rather than copying their full commands here.
