# Upstream 0.9.22 resource review

The official game reported 0.9.22, build `mw88813m`, on November 10, 2026 (Asia/Taipei). The captured snapshot and the independently reviewed resource contract pin that build. The upstream tracker had no discussion comments at review time.

The application, menu, configuration, and lazy-module graph were compared against 0.9.19. The season and 251-species limit remain the same. All 37 JSON catalogs and environment atlases have identical bytes. The 11 stylesheet URL sets match after normalizing hashed build names. The Three.js module has a new hashed path, and the revised graph supplies the new paths for modules, styles, and fonts.

The shop's Stellar collection adds Sakura, Abyss, Kintsugi, Vitral, and Dawn. For each set, the menu reads a JPG banner, PNG glow mask, PNG frame, and GLB frame model. The five GLBs contain their buffers and textures without external files. The resource contract requires all 20 files. The local profile includes the five upstream `slook:<member>` identifiers along with their banner and frame identifiers, so fresh and existing local profiles see all three items in each set as owned.

The menu music player now chooses Ogg or MP3 based on codec support and can switch to MP3 when Ogg decoding fails. The track table still has nine entries. The resource contract requires both formats for each track. The snapshot collector and validator accept MP3 while retaining the existing path checks. Electron already serves MP3 as `audio/mpeg`.

The four upstream asset-version groups for models, music, banners, and frames changed. The candidate refreshed those groups from their versioned URLs and reused verified snapshot bytes only where the versioned URL stayed identical. The legal page changed its Cloudflare email-obfuscation bytes between requests. Decoding the tokens produced identical content, and the contract hashes the exact pristine captured bytes.

Local preparation with upstream network access denied verified 3,874 packaged payload hashes. The Electron Stellar shop check exercises all five rendered sets, confirms all 15 items are owned, decodes banner, glow, and frame images, and reads and decodes the menu track in both formats from the offline app. The resource-contract test rejects each of the 29 newly required files when omitted from the inventory.

The full native smoke initially timed out on a lazy treasure-frame layer in the appearance picker. The PNG bytes match the previous snapshot and the renderer reported no HTTP error. The smoke check now requests the rendered image elements explicitly and decodes them in the page, independent of clipping and scroll position. The native readiness fixture covers a clipped lazy image and still rejects corrupt or missing images.

The League screen now exposes both a roster tile and a detail control with the same species label. The acceptance test selects the roster tile explicitly. The full local Electron run passed the appearance picker, nine gameplay scenarios, manual and automatic save restoration, corrupt-profile recovery, and network isolation on the 0.9.22 candidate.
