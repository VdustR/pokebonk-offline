# Upstream 0.9.19 resource review

The reviewed target is 0.9.19, build `mw6akj2h`, observed on November 7, 2026 (Asia/Taipei). The [upstream tracker](https://github.com/VdustR/pokebonk-offline/issues/34) previously reported 0.9.17; the official site had advanced by acquisition time. This review pins the actual captured build rather than assuming the issue's earlier observation is current.

## Resource and adapter review

The [0.9.8 producer audit](upstream-0.9.8-review.md) and [0.9.13 frame-capability review](upstream-0.9.13-review.md) remain the baseline. The pristine HTML/module/style graph and configuration were fetched for independent comparison before acquisition. All 37 existing JSON catalogs and environment atlases have identical bytes. All 11 stylesheet URL sets are unchanged after normalizing the build suffix. Season 3 and the 251-species limit remain unchanged.

The treasure catalog grows from three to six wheels: psychic (Abra), ghost (Gastly), and electric (Pikachu) join fire, grass, and water. Each new wheel requires `assets/ui/treasures/bg-<id>.png` and `assets/ui/frames/tr-<id>-{1,2}.png`. These nine paths are independently required by the resource contract. Native acceptance additionally reproduced six missing original-wheel frame PNGs: the changed animated renderer now requests `tr-{fire,grass,water}-{1,2}.png`. Those paths were absent from the previous snapshot and are now mandatory too, giving 15 independently added resource requirements. The catalog-driven collector and local treasure backend already enumerate them without a fixed three-wheel assumption.

Six additional treasure looks introduce the procedural styles psionic, spectre, and storm. The actual PNG frame-picker catalog remains the same 12 styles. The existing capability-based adapter therefore preserves their procedural rendering without inventing corresponding `look-*.png` resources. New animated treasure/legendary frame markup refers to the frame PNG domain through images and the `--tf-img` CSS variable. Changed `ui/frames` and `ui/treasures` version groups require fresh original bytes; other resource-version groups are unchanged. The new explicit Celebi portrait producer uses the already-required `assets/portraits/251.png`.

The discovered graph contains the Cloudflare legal-page email decoder. It decodes email links and removes its script element, with no asset URL producer. Hashed module, style, and font paths follow the new graph; stable required resources are retained independently of the candidate manifest. The contract has 70 reviewed inputs and 3,611 required resources.

Every existing semantic adapter passed the pristine application/menu/configuration modules, including local backend injection, checkpoint ownership, storage failure reporting, offline Friends, and optional look frames. No builder gameplay patch or new dependency is introduced. The official configuration changelog describes new treasure wheels, animated frames, build planning/rental features, performance improvements, expedition saving, and gameplay/UI fixes across 0.9.14–0.9.19. This is an upstream description, not a claim that online-only services are available offline. The official site/configuration provides no attached discussion thread; tracker discussion was empty when read.

The acquisition gate rejected a different `legal.html` hash from the separate review fetch. Comparing every changed Cloudflare token after decoding established identical legal text and contact addresses; only the email-obfuscation keys differed. The contract pins the acquired original bytes, without normalizing the snapshot or relaxing the hash gate. A later fresh acquisition may require another legal-page review even for the same game build.

## Native appearance readiness

The new animated frame images use native lazy loading. The previous acceptance helper decoded every image concurrently without scrolling, leaving offscreen legendary frames pending. Inspecting the real Electron page showed 25 unloaded lazy images below the viewport. A local PNG fixture positioned 10,000 pixels below the viewport reproduces the old helper’s deadline failure. Acceptance now scrolls each image into view before decoding, while retaining the generated-portrait source-readiness wait and explicit rejection of corrupt and missing images. Product loading behavior is unchanged.

## Verification

Local verification passed 105 tests, type checking, 60 compiler probes, and all 3,845 payload hashes with upstream requests denied during preparation. Targeted controls reject every omitted treasure frame and each new background. The lazy-loading fixture failed with the original helper, passed with scrolling, failed after restoring the original, and passed again; corrupt and missing images still reject.

The clean Electron run passed all six treasure pages and their completed prizes/looks/frames, all five appearance tabs, nine gameplay scenarios, pointer lock, live checkpoints, manual and automatic process-restart recovery, settlement, corrupt-storage preservation, and network isolation. Victory summaries and deliberately injected image failures also passed their positive/negative controls. All-platform PR packaging and post-merge publication remain delivery gates. Physical-device and installed-user-profile acceptance are separate and are not claimed by disposable-profile checks.
