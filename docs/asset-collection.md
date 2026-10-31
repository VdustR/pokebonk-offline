# Catalog-driven asset collection

`sync-upstream.ts` must enumerate every member of the status, clan-reaction, gameplay-upgrade, held-item, and shop icon catalogs. Their images are required downloads, so an unavailable catalog image stops collection. `verify-game.ts` independently resolves the catalogs from the bundled modules, checks manifest membership and PNG signatures, and rejects an otherwise consistent bundle that omits a catalog member. Electron and Android runtime checks decode the catalog images through the native origin.

## Gameplay item image omission

On October 25, 2026, the installed 0.8.34 build (`mvlr7rzv`) repeatedly requested `assets/items/enigma-berry.png` during a run and received HTTP 404 through the Electron origin. The same upstream image returned HTTP 200 with a PNG signature. The upgrade catalog also referenced `sticky-barb`, `super-lure`, `poke-radar`, and `loaded-dice`, whose images were absent from the bundle. All five were available upstream.

The collector previously enumerated item images only through `data/items.json`. The upgrade catalog contains additional items, and the renderer passes each upgrade's `icon` token, which can differ from its `key`. Its item helper uses the JSON icon override when present and otherwise builds `items/<token>.png`. Marking a key as required cannot collect an image when the key has no JSON record.

`item-icons.ts` now resolves upgrade icon tokens and held-item/shop keys, applies the same JSON override or filename fallback, and makes the resulting paths required downloads. It validates catalog identity, duplicate keys, tokens, and image paths before collection. The payload verifier recomputes the paths from config and item data rather than trusting metadata; native tests decode every required image. Tests cover a new catalog entry, an icon/key alias, a JSON override, an absent JSON entry, missing/corrupt images under a consistent manifest, and malformed catalogs. No game image-error fallback is suppressed or changed.

The retained working evidence lives in `evidence/image-failure-before.json` and `evidence/item-images-repro.json` in the repair workspace. The former records the real failed requests; the latter compares the actual catalog and payload inventory and checks upstream responses. These ignored files are local diagnostic evidence, not packaged resources.

## Reproduced omission

For upstream version 0.8.34, build `mvlr7rzv`, the renderer constructs `r-` plus a reaction ID. Its imported catalog contains `gg`, `love`, `fire`, `star`, `lol`, and `wow`. The previous collector inspected literal fragments inside icon calls; it guessed `r-.png`, leaving five valid upstream PNGs out of the bundle. Only `r-gg.png` was collected through another literal call.

The working reproduction resolved the real renderer's catalog and compared its filenames against the actual payload manifest. It failed on the original 2,172-file bundle, passed after collection produced 2,177 files, and failed again against the retained original bundle. Direct upstream requests returned HTTP 200 and PNG signatures for all five missing images. This establishes the collection defect, not a cause for an unexplained in-battle visual symptom.

## Design and regression checks

The resolver follows an icon-rendering map callback to its imported binding, then the config export and validated catalog. It does not depend on minified variable names or hardcode the six reaction IDs. Empty, duplicate, unsafe, missing, or incompatible catalogs stop collection. A new concatenated icon prefix also stops collection until a resolver accounts for it.

Hardcoding the five missing paths would repair one release but would miss later catalog additions. Guessing all string combinations would produce unrelated 404s without establishing which resources are required. Resolving the finite catalog makes each current and future catalog entry mandatory.

Run the maintained regression checks with:

```sh
node --test test/catalog-icons.test.ts test/status-icons.test.ts test/item-icons.test.ts
pnpm prepare:game
node scripts/verify-game.ts
pnpm e2e:electron
```

The tests cover renamed bindings, a new reaction, invalid catalogs, an unsupported prefix, and an omitted required icon even when every recorded hash matches. A separate corrupt-signature case verifies that the completeness check does not replace integrity validation.

## Evidence limits

This covers the resolved icon catalogs, not a general proof of all assets. Other producers include species, environment atlases, music, cosmetics, and externally supplied content. Hash verification proves the recorded inventory's bytes; it does not establish complete reachability. PNG signatures do not prove successful decoding, so runtime checks remain separate.

The static audit found no external image or buffer URIs in the 86 bundled GLB models. That rules out secondary-file omissions within those models, not missing entire models or rendering failures. The 316 absent optional candidates in the original manifest include guessed filenames and unsupported categories; they are not 316 established defects.

For a remaining in-battle symptom, capture failed request URLs and responses, loader errors, console errors, and rejected promises from the same map and encounter. Environment and model loaders can swallow a failure and return null, so the absence of a browser broken-image icon cannot establish success.

## Scene sprites outside the playable generation

On October 29, 2026, two scheduled CI runs for upstream build `mvtagocc` failed on `assets/pmd/249.png` and `assets/pmd/250.png`. The playable generation still ended at 151, but scene constructors preloaded animated Pokémon outside that range. Another scene preloaded nine additional species. The collector's playable-species rule did not cover these ambient actors.

`sprite-assets.ts` enumerates every animated entry in `data/sprites.json`, using the renderer's `hasAnimated` catalog condition. Collection makes every resulting PMD image mandatory, and verification recomputes this inventory from the bundled data. No scene syntax, current event, date, or playable-generation filter determines animated sprite coverage. Catalog additions are included even when no inspected scene references them. Empty or malformed catalogs and unsafe IDs reject before building paths; missing or corrupt images reject before packaging. Fallback-only entries do not require nonexistent animated sheets. This establishes completeness for this known sprite family, not for every possible resource URL.

A separate scheduled run failed while connecting to the upstream server. Both version discovery and collection now use the same bounded upstream GET retry boundary: at most three attempts for recognized transient connection failures, timeouts, HTTP 408/429, or server errors. Permanent responses, invalid URLs, validation errors, and exhausted attempts remain failures. Optional 404 candidates retain their existing behavior. A local HTTP server exercises a dropped connection, a body interrupted after successful headers, an expired body-read deadline, transient and persistent server failures, and a permanent 404. Successful bodies are fully read within the retry boundary before returning a response; gzip decoding and declared/actual byte limits remain checked.

## Moving completeness to the source boundary

The long-term invariant is that every local resource a supported build can request belongs to the packaged inventory. A manifest generated from already downloaded files proves integrity, but cannot prove that undiscovered files do not exist. Representative runtime tests prove only exercised paths.

The preferred source would be an upstream artifact containing the complete deployed directory and an inventory tied to its build. A Vite chunk manifest alone is insufficient for dynamically constructed public URLs: [Vite documents imported assets as part of the build graph](https://vite.dev/guide/assets), while public files are copied separately as-is. Its [build manifest](https://vite.dev/guide/backend-integration) describes emitted chunks, imports, CSS, and associated assets. Complete public-directory inventory must therefore be an explicit part of any upstream contract.

A live probe on October 29 found HTTP 404 at `/.vite/manifest.json`, `/asset-manifest.json`, and `/assets/manifest.json`. `/manifest.webmanifest` exists but describes app installation, not a complete inventory. These probes do not establish that no complete inventory or source artifact is available anywhere.

Without that artifact, prefer a conservative finite inventory for each resource family, derived from data catalogs rather than currently exercised gameplay. The measured `data/sprites.json` describes 1,025 species, including 971 animated entries, of which 820 exceed the playable limit of 151. All 971 versioned PMD URLs returned HTTP 200 with PNG content type and declared lengths totaling 28,947,129 bytes (27.6 MiB). Compared with the initial nine-image repair, full enumeration adds 810 files / 24,288,472 bytes (23.2 MiB). The user approved this size tradeoff. HEAD establishes availability and declared size at observation time; actual downloads and signatures remain required checks. The retained measurement is `evidence/full-sprite-inventory-head.json` in the repair workspace.

| Approach | Guarantee and limitation |
| --- | --- |
| Complete upstream artifact and build inventory | Strongest boundary: all deployed files are available before packaging. Requires an upstream source that has not been established. |
| Complete finite catalogs per resource family | Covers additions within known families without understanding every scene. Requires verified URL rules, availability and a measured size budget; unknown families must still be detected. |
| Runtime request capture during build | Finds resources requested by exercised scenes and can supplement the inventory. Unvisited events, dates and branches remain uncovered. |
| Download on first use | Used by the community [multiplayer server](https://github.com/vacfeg/pokebonk-multiplayer/blob/main/server.js), but first access still needs the upstream server. It does not meet this project's fully bundled offline contract. |

The complete animated sprite family is now collected from its data catalog. The next architectural step is to audit the remaining URL-producing helpers by resource family and establish complete finite inventories where possible, rather than adding a resolver for each new gameplay scenario. Unknown families and URL-rule changes remain a limitation until that audit is implemented. Keep native offline tests as an independent defense. Do not claim exhaustive offline completeness from either request capture or shared collector/verifier logic alone.


## Resuming interrupted upstream downloads

The upstream server can remain unavailable beyond the GET retry budget. A current-head CI attempt on October 29 exhausted retries on a font with Cloudflare 522, before sprite collection. A rerun was still downloading fonts after 19 minutes. This is a separate acquisition failure, not evidence against sprite completeness.

The sync workflow restores and checkpoints only `cache/upstream`, keyed by upstream build, run and attempt. Prefix restore selects the latest checkpoint for the same build. Acquisition has a 20-minute process budget, leaving time to checkpoint before the job deadline. The save step also runs after a collection failure; a new attempt can reuse completed responses instead of restarting. Cache writes use a temporary file followed by rename, so a checkpoint cannot expose a partially written response under its final URL-hash name. Binary HTML-error detection precedes cache publication. Temporary files are never cache reads.

[GitHub documents immutable caches and branch isolation](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching). A unique attempt key allows a partial cache to grow; PR caches do not become default-branch caches. The path contains public upstream responses and optional-missing markers, not credentials or saves. Cache service failures remain non-blocking optimizations. Collection, all payload checks, native tests and release gates still run, and required downloads still fail after exhausted retries. Checkpointing mitigates lost progress; it cannot repair an unavailable origin.


## Committed inputs and offline preparation

The captured, unmodified upstream files now live in `vendor/pokebonk/game/`, with a versioned inventory and digest in `snapshot.json`. `prepare-game.ts` reads and verifies this committed input and performs no downloads; `sync-upstream.ts` alone acquires newer candidates. The separate sync validates candidates through the shared platform workflow before a data-only writer commits the exact validated digest. See [upstream snapshots](upstream-snapshots.md) for the ownership and failure boundaries. This freezes the supported captured inventory; it does not establish that the origin exposes no additional resources.

## Release-note category icons

The 0.8.83 release-note renderer reads category icons from an indirect table. The previous collector found literal icon calls but omitted `level.png` (improvements) and `calabaza.png` (events). A snapshot regression reproduced the missing category image; both versioned upstream URLs returned HTTP 200 with PNG bytes. The snapshot now includes the original images.

`release-icons.ts` resolves the category table from its stable category IDs and requires each icon during acquisition and payload verification. Missing, ambiguous, duplicate, or unsafe records reject the build. The verifier fixture demonstrates missing and corrupt images failing even with internally consistent manifest hashes. Native acceptance opens the release notes and decodes their rendered category images; this supplements the full-table inventory check because one release may not display every category.
