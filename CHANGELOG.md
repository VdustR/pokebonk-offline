# pokebonk-offline-builder

## 0.0.9

### Patch Changes

- Upgrade pinned artifact upload and download Actions to Node.js 24 releases, preserving archived transfers and extraction paths while rejecting download digest mismatches by default.

## 0.0.8

### Patch Changes

- Verify map opening and closing through the player keyboard shortcut instead of a private upstream method that can be renamed during minification. Keep visible-map, pause, pointer-release, and resume checks in native CI.

## 0.0.7

### Patch Changes

- Recognize the existing Electron and Android local asset origins in the upstream boot gate without changing save origins or allowing unrelated mirrors. Capture startup refusals directly in native CI evidence.

## 0.0.6

### Patch Changes

- Build from a verified upstream snapshot committed to Git, so upstream outages cannot block builder fixes or packaging. A separate six-hour sync validates candidates across all platforms before committing them and triggering a release.
- Collect the complete animated sprite catalog, retry interrupted response bodies, and checkpoint downloads during upstream synchronization.

## 0.0.5

### Patch Changes

- Recognize upstream Pokédex fields initialized by constructor helpers, bundle the complete daily mutation image catalog, and wait for fullscreen settings updates in native integration tests.

## 0.0.4

### Patch Changes

- Restore desktop fullscreen controls and shortcuts, and offer a native confirmation when closing an active run. Restore standard application menus for close, quit, minimize and text editing while retaining offline isolation.

## 0.0.3

### Patch Changes

- Restore desktop keyboard/mouse camera control by allowing pointer lock only for the bundled game's main frame, while preserving other permission denials.

## 0.0.2

### Patch Changes

- Bundle every gameplay upgrade, held-item, and shop icon from the game catalogs, including images absent from items.json. Reject incomplete bundles and decode these images in native runtime checks.

## 0.0.1

### Patch Changes

- Introduce readable upstream/offline release versions, explicit Latest selection, native application versions, and build provenance. Retain the existing unlocked save format and Android signing identity.
