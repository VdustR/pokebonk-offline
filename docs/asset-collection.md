# Catalog-driven asset collection

`prepare-game.ts` must enumerate every member of the status and clan-reaction icon catalogs. Their images are required downloads, so an unavailable catalog image stops collection. `verify-game.ts` independently resolves the catalogs from the bundled modules, checks manifest membership and PNG signatures, and rejects an otherwise consistent bundle that omits a catalog member. Electron and Android runtime checks decode the catalog images through the native origin.

## Reproduced omission

For upstream version 0.8.34, build `mvlr7rzv`, the renderer constructs `r-` plus a reaction ID. Its imported catalog contains `gg`, `love`, `fire`, `star`, `lol`, and `wow`. The previous collector inspected literal fragments inside icon calls; it guessed `r-.png`, leaving five valid upstream PNGs out of the bundle. Only `r-gg.png` was collected through another literal call.

The working reproduction resolved the real renderer's catalog and compared its filenames against the actual payload manifest. It failed on the original 2,172-file bundle, passed after collection produced 2,177 files, and failed again against the retained original bundle. Direct upstream requests returned HTTP 200 and PNG signatures for all five missing images. This establishes the collection defect, not a cause for an unexplained in-battle visual symptom.

## Design and regression checks

The resolver follows an icon-rendering map callback to its imported binding, then the config export and validated catalog. It does not depend on minified variable names or hardcode the six reaction IDs. Empty, duplicate, unsafe, missing, or incompatible catalogs stop collection. A new concatenated icon prefix also stops collection until a resolver accounts for it.

Hardcoding the five missing paths would repair one release but would miss later catalog additions. Guessing all string combinations would produce unrelated 404s without establishing which resources are required. Resolving the finite catalog makes each current and future catalog entry mandatory.

Run the maintained regression checks with:

```sh
node --test test/catalog-icons.test.ts test/status-icons.test.ts
pnpm prepare:game
node scripts/verify-game.ts
pnpm e2e:electron
```

The tests cover renamed bindings, a new reaction, invalid catalogs, an unsupported prefix, and an omitted required icon even when every recorded hash matches. A separate corrupt-signature case verifies that the completeness check does not replace integrity validation.

## Evidence limits

This is coverage for two known dynamic icon families, not a general proof of all assets. Other producers include species, environment atlases, music, cosmetics, and externally supplied content. Hash verification proves the recorded inventory's bytes; it does not establish complete reachability. PNG signatures do not prove successful decoding, so runtime checks remain separate.

The static audit found no external image or buffer URIs in the 86 bundled GLB models. That rules out secondary-file omissions within those models, not missing entire models or rendering failures. The 316 absent optional candidates in the original manifest include guessed filenames and unsupported categories; they are not 316 established defects.

For a remaining in-battle symptom, capture failed request URLs and responses, loader errors, console errors, and rejected promises from the same map and encounter. Environment and model loaders can swallow a failure and return null, so the absence of a browser broken-image icon cannot establish success.
