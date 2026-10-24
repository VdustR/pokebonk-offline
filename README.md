# PokéBonk Offline

Unofficial [PokéBonk](https://pokebonk.com/) unlock-all PWA. The game runs entirely in the frontend, saves locally, and downloads all bundled resources for offline play. No account backend, Electron app, APK, or signing key is required.

## Install and play

1. Open [PokéBonk Offline](https://vdustr.github.io/pokebonk-offline/).
2. Wait for the offline-ready message. The first visit downloads approximately 62 MiB for the currently supported build.
3. Use Chrome/Edge's Install option on desktop or Android, or Safari's Add to Home Screen on iOS. After preparation, the installed app and browser page can reopen without a network connection.

GitHub Pages serves the game publicly over HTTPS. Repository visibility is managed separately. Saves from a previous local preview remain on that origin and do not automatically transfer to Pages.

## Unlocks and saves

Catalogs determine the unlocks: every current League member, maximum Lab upgrades, all purchasable item unlocks, shiny/classic/mastery/spectral character looks, catalog cosmetics, one billion Stardust, and 999 of each preparation item. All current achievements are completed and claimed, including their titles and mastery-look rewards. Unlocks are reapplied when loading and saving. Unavailable future-season maps remain unavailable; run counters and recent results still reflect local play.

Preferences, selected character, and recent run results persist in the browser's local storage. Clearing site data or changing the hosting origin can remove or separate the save. Browser storage policies can evict cached resources, so an installed PWA is not an unconditional storage guarantee. No official account or save is imported or modified.

Online multiplayer, clans, social features, mail, and rankings are unavailable. Original UI entry points may remain visible and return a local unsupported-feature message.

## Build and preview

Requirements: Node.js 24 and pnpm 10.33.2. Only Acorn and Playwright Core are project dependencies. No native application toolchain is needed.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm prepare:game
node scripts/verify-game.mjs
pnpm preview
```

The preview serves static files on `127.0.0.1:8098`, or `PORT`. With Portless installed, use `portless pokebonk-offline pnpm preview` for a stable local URL. There are no save, account, or gameplay endpoints. For browser tests:

```sh
pnpm exec playwright-core install chromium
pnpm e2e:pwa
```

On macOS the test uses installed Chrome Stable. Set `CHROME_BIN` to test with another existing Chromium executable. CI uses Playwright's downloaded Chromium in an isolated browser profile.

## Offline installation and updates

The service worker downloads the complete asset manifest and verifies every resource's byte length and SHA-256 before marking the new cache ready. A failed or interrupted download removes its incomplete cache and preserves the prior version. Reconnect and use Retry if preparation fails.

New versions download in the background. Active games stay on their original build; close all game tabs/app windows and reopen to activate a downloaded update. Old caches are removed only when the new worker activates. Local saves are independent of the asset cache.

## Automatic deployment

The workflow runs on main changes, pull requests, manual dispatch, and every six hours. It compares the game's build identifier and builder commit with the deployed Pages build metadata. Unchanged identities skip resource collection, browser tests, and publication.

Changed builds must pass semantic compatibility checks, local-save tests, cache integrity/failure tests, payload SHA-256 verification, full precaching, offline reload/persistence, and representative offline gameplay on four maps plus the Halloween tower. Only then does CI deploy the verified static payload to GitHub Pages. No GitHub Release is created. Pull requests validate without publishing. Unsupported upstream structures or missing required resources fail instead of publishing an assumed-compatible build.

The collector follows module/CSS dependencies and current game catalogs, downloading data, sprites, models, maps, music, fonts, and cosmetics into ignored output. Optional candidate paths absent on the upstream site are recorded in `asset-manifest.json`; any missing resource actually requested in gameplay smoke tests fails publication. These tests are representative, not exhaustive coverage of every late-game event, browser, or physical mobile device.

## Attribution

The original build-workflow approach references [VdustR/pokerogue-offline](https://github.com/VdustR/pokerogue-offline/tree/5207e18f9986717824b30cef01c034a6e46db4a3). Builder code uses the included AGPL-3.0 license.

PokéBonk's game code and resources are fetched at build time, retain their original rights, and are not covered by the builder license or tracked in Git. Credit goes to Charcher and the original contributors. Pokémon names and assets belong to their respective owners; the original game's credits and legal page remain included. This is an unofficial, noncommercial personal build with no affiliation or endorsement. The Pages website is publicly accessible; the upstream game is bundled only into deployment artifacts.
