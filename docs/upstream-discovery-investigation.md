# Upstream discovery bound investigation

## Disposition and scope

The [November 20 version check](https://github.com/VdustR/pokebonk-offline/actions/runs/44708452663) failed at the existing 48-module discovery bound. The [November 21 check](https://github.com/VdustR/pokebonk-offline/actions/runs/44886369586) succeeded on the same [main source revision](https://github.com/VdustR/pokebonk-offline/commit/98e42caa9e9fa488cf39272d32a5b55b8c36d5e9), detecting upstream **0.10.19**, build **mwpmhsgg**. Discovery has currently recovered without a source change. The historical graph and the cause of its different traversal remain unverified.

This investigation preserves production behavior and its limits. It adds deterministic boundary tests and rerun instructions. It does not claim to repair the historical failure. It does not capture, accept, promote or publish an upstream snapshot. The [open update tracker](https://github.com/VdustR/pokebonk-offline/issues/50) still represents an unaccepted upstream update; its body and comments were read during investigation, and there were no comments or competing open PRs at the initial check.

## Observed evidence

The failed run, created November 20 at 09:10:23 UTC, threw `Upstream module graph exceeded limit`. The code increments the unique URL count and rejects before requesting the 49th module. The logs do not identify the HTML build, discovered URLs, or version module position. A larger legitimate graph, changed import ordering, or inconsistent upstream responses cannot be distinguished from those logs. Increasing the bound would be speculative.

A read-only live probe completed November 21 at 10:35:01 UTC (18:35:01 Asia/Taipei), using the unchanged `discoverUpstream` and `requestUpstream`. It read HTML plus **28 JavaScript modules** before finding the HTML build mapping. This is the visited prefix through the first match, not the complete upstream graph. A second probe parsed the same visited prefix and recorded dependency metadata without executing or saving upstream sources.

| Observed node | Relevant imports | SHA-256 of UTF-8 source |
| --- | --- | --- |
| HTML | Five JS roots: boot main, modulepreload polyfill, i18n, gfx, preload helper | `f53f2f9feb2450f849e3cc470d4ef2904e6f68fee55713ff116d7fadb3626ba4` |
| `/assets/main-DFRWp3BU-mwpmhsgg.js` | Four static imports; 20 locale dynamic imports followed by the game main dynamic import | `e338e09eb4b5217365d423b4c61ab1cfb4c4bc846e83a32271093cc883ad14e3` |
| `/assets/main-C2tzcbD2-mwpmhsgg.js` | Static imports include moves, i18n, gfx, preload helper and news | `8171fc297c1f44a2267f5a88e7577f98cd71f7f9bf19a77fc3881db19ac9515b` |
| `/assets/news-CwBiLp16-mwpmhsgg.js` | Contains the matching `{version: '0.10.19', build: 'mwpmhsgg'}` mapping | `e668bb612933b07afb870ef809751c3d5a5acdf4aae66986bed1a10d1189145f` |

The original probe decoded each response with `response.text()` and measured and hashed that source re-encoded as UTF-8. The visited sources totaled 15.8 MiB (16,584,471 UTF-8 bytes); each source stayed below the existing 4 MiB limit. These measurements describe decoded source, not a retained raw HTTP payload. The rerun below instead measures the response body bytes directly. This observation does not establish yesterday's build or graph. The current news module also lists older builds, but that does not establish which one the failed run served.

## Design and acceptance

The invariant is bounded discovery of a literal version mapping for the exact HTML build, without executing downloaded JavaScript. Keep the existing 48 unique-module limit, same-origin asset URL validation, per-response size checks, duplicate suppression, and visible failure propagation.

| Option | Decision |
| --- | --- |
| Increase the limit | Rejected: no retained historical graph establishes an appropriate replacement bound. |
| Prioritize filenames or change graph traversal | Rejected: current discovery succeeds; a naming or ordering heuristic has no demonstrated historical repair. |
| Preserve behavior and verify the boundary | Selected: records current recovery and protects success at 48, rejection before fetching 49, cycle handling and size rejection. |

One delivery unit contains this evidence and `test/upstream-version.test.ts`; splitting would separate the test premise from its evidence. Independent design review supported this scope before editing. Initial confirmation checkpoint: no unresolved design decision, new dependency, production behavior change, or required human decision. Historical causality is explicitly an evidence limit. Final integration must still verify tests, independent diff review, complete feedback, current main/head and the same scope.

## Rerun

Use the repository's pinned pnpm and supported Node version, then install the lockfile with scripts disabled. The deterministic tests make no network requests and contain synthetic modules, not copied upstream assets:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test test/upstream-version.test.ts test/release.test.ts
pnpm test
pnpm typecheck
pnpm test:types
```

The boundary suite checks the 48th-module success and 49th-module pre-request rejection separately. It also checks duplicate roots, static/dynamic import cycles, exhaustion without a matching HTML build, and oversized responses with and without advertised lengths. Existing release tests check unsupported URLs, HTTP failures and ambiguous/malformed mappings. Isolated mutation trials must reject both an off-by-one lower cap and a cap that permits a 49th request; these trials validate test protection, not a historical fix.

For a current read-only observation that reports visited URLs and response metadata without saving game files or editing the tracker:

```sh
node --input-type=module <<'JS'
import {createHash} from 'node:crypto';
import {discoverUpstream} from './scripts/upstream-version.ts';
import {requestUpstream} from './scripts/upstream-request.ts';
const requests=[];
try {
  const result=await discoverUpstream(async url=>{
    const response=await requestUpstream(url);
    const bytes=await response.arrayBuffer();
    requests.push({url,status:response.status,bytes:bytes.byteLength,
      sha256:createHash('sha256').update(new Uint8Array(bytes)).digest('hex')});
    return new Response(bytes,{status:response.status,headers:response.headers});
  });
  console.log(JSON.stringify({observedAt:new Date().toISOString(),result,requests},null,2));
} catch(error) {
  console.error(JSON.stringify({observedAt:new Date().toISOString(),error:String(error),requests},null,2));
  process.exitCode=1;
}
JS
```

Future upstream changes can alter the observation. If the bound failure returns, retain the HTML build and dependency URL/hash metadata before proposing a traversal or bound change; do not promote the fetched responses as a snapshot. Repository maintainer VdustR owns reassessment through the existing daily check and update tracker. A newly failing run with this metadata is the reopening condition. There is no new monitor or automatic asset acquisition.

## Verification results

The focused discovery/release suite passed 15/15, including an independent reviewer rerun. Isolated copies with caps 48, 47, 49 and restored 48 produced pass, fail, fail and pass respectively. Production source was never modified. Type checking passed for 109 maintained inputs, and all 60 compiler probes passed.

The full `pnpm test` run passed 116/117 tests. Its offline-build test stopped at the pre-existing pending Changeset release guard. The same `offlineVersion()` call fails in unchanged main because `.changeset/draft-release-discovery.md` is pending. The [merged publisher-tooling change](https://github.com/VdustR/pokebonk-offline/pull/49), including its discussion, explicitly leaves that Changeset for the next normal packaging cycle; it did not require rebuilding unchanged binaries. This investigation preserves that guard and pending file. The full suite is therefore not reported as green, and packaging remains held until the normal versioning step. This baseline limitation does not affect discovery or the docs/tests delivery.

## Release boundary

The only Actions workflow runs the version reporter on schedule or manual dispatch on main. Pushes and PRs have no configured CI or deployment workflow. Tests and type checks therefore run locally and their current-head results must be recorded in the PR. Branch protection and rulesets were absent at initial inspection; final integration must recheck them.

The [Changesets policy](../.changeset/README.md) exempts documentation-only and test-only changes from an offline version bump. The [local release procedure](local-release.md) publishes native apps after separate resource review and packaging. This unit changes no packaged source or accepted game data, so its delivery endpoint is a reviewed merge to main with source readback; no native release is needed.
