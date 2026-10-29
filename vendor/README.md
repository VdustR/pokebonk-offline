# Vendored upstream snapshot

`pokebonk/game/` contains pristine public PokéBonk files captured from https://pokebonk.com/. These third-party files retain their original rights and are not licensed under this builder's AGPL-3.0 license. The upstream legal page and in-game credits remain included. See `pokebonk/game/legal.html` for the upstream resource attributions and notices.

`snapshot.json` records the upstream build/version, every file's size and SHA-256, missing optional candidates, and the inventory digest. Do not hand-edit this generated snapshot. Offline preparation verifies it and applies builder changes only to generated output.

`pnpm sync:upstream` stages a new candidate under `cache/upstream-candidate/`. The scheduled sync workflow validates it through the same platform checks as ordinary builds before a separate data-only job promotes and commits the exact validated digest. A failed acquisition or validation keeps the committed snapshot unchanged. No game account, save, credential, or private profile belongs here.
