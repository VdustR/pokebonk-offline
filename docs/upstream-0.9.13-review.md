# Upstream 0.9.13 review

The reviewed target is 0.9.13, build `mw41iu0i`, observed on November 6, 2026 (Asia/Taipei). Offline 0.0.22 also introduces the issue-based version check and replaces the inferred style-frame exception list with the upstream frame catalog.

## Resource and adapter review

The [0.9.11 audit](upstream-0.9.11-review.md) remains the resource-domain baseline. Comparing the actual application, menu, and configuration modules finds no added or removed asset literals, model/cosmetic identifiers, or resource-producing template quasis. All asset-version groups are unchanged. Fresh JSON catalogs and environment atlases have identical hashes, including both Chinese locales. League, Lab, shop, biome, achievement, generation, and season inventories remain unchanged.

The retired email module is absent from the new discovered graph. Hashed entry/module/style/font paths and all reviewed executable-input hashes follow the new graph; stable required resources remain independently retained. Verified binary cache bytes are reused only at identical versioned URLs. The reviewed contract has 70 inputs and 3,595 required resources. Every existing semantic patch stage passed the original modules; native and platform checks remain required.

The official changelog describes touch-scroll, relic comparison, rendering and reward fixes in 0.9.12 and a cooperative protective-bubble fix in 0.9.13. No separate offline balance or gameplay changes are introduced.

## Procedural looks are not PNG frame declarations

The earlier [frame follow-up](https://github.com/VdustR/pokebonk-offline/issues/30) recorded three 404 responses and assumed original PNGs needed restoration. Further inspection does not establish that assumption:

- The three treasure looks declare procedural styles and color palettes, without an explicit PNG frame override.
- The upstream frame picker enumerates 12 PNG frame styles. They exactly match the 12 available and required `look-*.png` resources; ember, verdant, and tidal are not in that list.
- Separate rendering code generates procedural look effects and SVG treasure frames.
- A generic preview function nevertheless derives `look-<style>.png` for every style and removes the image on error. A failed derived request alone is not an asset declaration.

The collector and preview adapter now share the actual frame-picker catalog, resolved through its verified configuration-module import. Only declared default PNG frames are acquired/rendered. Explicit overrides keep their normal path, and procedural effects and SVG frame rendering stay intact. Catalog ambiguity, duplicate styles, unsafe paths, or unknown module ownership fail preparation.

This fixes the offline candidate-generation assumption; it does not claim that official PNG files were restored or prove the upstream author's intent. The regression includes a procedural style outside the old three-name exception and a newly declared frame style, so restoring the hard-coded exception fails it.

Local verification passed 104 tests, type checking, 60 compiler probes and 3,829 payload hashes with upstream requests denied during preparation. Real Electron runs passed nine scenarios, pointer lock, checkpoints, manual/automatic process-restart save recovery, settlement, corrupt-save preservation and network isolation. The season-module collision regression now uses an executed, stable fixture rather than asserting a particular minified constant in the moving upstream bundle; it fails with the old wrong-module resolver and passes with source ownership resolution.
