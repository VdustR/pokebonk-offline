# TypeScript boundaries and verification

All maintained JavaScript has moved to TypeScript. The game snapshot stored under `vendor/pokebonk/game/` remains upstream JavaScript, and the Android shell remains Java/Gradle. Only JavaScript files listed in the verified snapshot manifest are exempt from authored-source coverage; unlisted vendor JavaScript still rejects. Build output and caches are ignored generated files, owned by the collector, TypeScript compiler, and Android build respectively.

## Stack decision

| Option | Decision and cost |
| --- | --- |
| TypeScript 7.0.2 stable | Selected; exact pin and native CLI. No compiler API is needed. |
| TypeScript 7.1 beta/nightly | Evaluated, deferred: its compiler API does not solve a requirement in this repository; preview adoption adds compatibility work. |
| TypeScript 6 | Retained as an alternative if a future regression cannot be isolated. Current checks and native packaging pass on 7.0.2 with incremental compilation disabled. |
| `tsx` or a second bundler | Unnecessary: Node's native type stripping executes the tools/tests, and `tsc` emits the two runtime entrypoints. |

[Node's native TypeScript support](https://nodejs.org/api/typescript.html) strips erasable syntax without checking types or reading `tsconfig.json`. Node 24.12+ is required. [TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) supplies the separate compiler check. CI invokes that check before tests and packaging.

Incremental compilation is deliberately disabled in all projects. A small local probe on 7.0.2 accepted a consumer after its global declaration changed from `number` to `string`; a non-incremental check reported TS2322. This matches the class of invalidation failures discussed in [the upstream incremental diagnostics issue](https://github.com/microsoft/typescript-go/issues/4664) and [the stable-branch backport request](https://github.com/microsoft/TypeScript/issues/64809). The repository is small enough to run complete checks on every invocation. Do not re-enable caches solely for speed: first pass the repeated source, dependency, global, and configuration-change probes with caching enabled on the replacement compiler.

## Environment contracts

| Project | Maintained inputs | Host and output |
| --- | --- | --- |
| `tsconfig.node.json` | `scripts/`, `test/`, imported data validators | Node globals, no DOM; native `.ts` execution |
| `tsconfig.desktop.json` | `desktop/` | Electron main process; Node plus DOM declarations required by Electron's request/response contract |
| `tsconfig.runtime.json` | `runtime/`, upstream adapter declarations | Browser globals, no Node/Electron; standalone script emitted to `dist/runtime/local-backend.js` |
| `tsconfig.e2e.json` | `e2e/`, narrow game-window declarations | Playwright Node controller and serialized browser callbacks |

Every project extends `@tsconfig/strictest` and includes the application-owned `types/reset.d.ts` importing `@total-typescript/ts-reset`. Indexed access, exact optional properties, unused symbols, erasable syntax, and type-only imports are checked. `skipLibCheck` stays false. The root solution config lets editors discover the four leaf projects. Select the workspace TypeScript version in the editor; editor project selection has not been separately automated.

The build configs emit only the Electron entrypoint and injected browser backend, excluding negative type fixtures. Electron packages receive the emitted file as `main.mjs`, so installed apps do not depend on native TypeScript loading. The browser template emits no imports or exports. Tools import `.ts` directly; type contracts use erased `import type` declarations. There is no runtime alias resolver.

## Data boundaries

- JSON/fetch results start as `unknown`. Small validators check metadata, manifests, upstream catalogs, and fields consumed from saved profiles.
- Profile normalization preserves unknown upstream fields, real run counters, selected characters, equipped looks, and settings. Invalid structures reject without overwriting the saved value.
- Acorn supplies the syntax-tree union. Localized assertions bridge its recursive traversal and generic discriminant narrowing; semantic predicates still reject missing or ambiguous structures.
- The VM test harness checks method presence before bridging to the backend interface; the compiled class implements that interface and behavior tests exercise it. E2E game-window declarations describe only the upstream surface actually probed.
- Electron's undeclared preferences probe is feature-checked at runtime. Node's WHATWG byte stream is annotated at its Electron `Response` boundary.

## Checks

```sh
pnpm typecheck
pnpm test:types
pnpm test
pnpm prepare:game
node scripts/verify-game.ts
pnpm e2e:electron
```

`typecheck` runs all four leaf compilers and compares their compiler-resolved inputs against tracked plus untracked, non-ignored source files. It rejects orphan sources, authored JavaScript, disabled strict flags, missing reset declarations, and Node/DOM leaks. Intentional `@ts-expect-error` fixtures prove JSON remains unknown and indexed/optional boundaries stay strict.

`test:types` executes cold and repeated checks, introduces source errors, changes an imported dependency outside the consumer's include list, changes a shared global declaration, and changes a compiler config. Each error must fail twice; restored inputs must pass. It also verifies that adding an orphan TypeScript file fails the coverage gate. Results and compiler diagnostics are saved in ignored `evidence/types-cache.json`; timings are observations, not a performance claim. No remote cache is configured.

Unit tests verify the emitted standalone template, incompatible upstream rejection, VM isolation, saved-profile preservation, corrupt-save rejection, all unlock categories, period rollover, and status-icon collection. Native E2E separately covers gameplay, image decoding, save/reload, and Electron isolation; type checking alone does not establish those behaviors.

To roll back the migration, revert its merge commit as a whole so source extensions, command paths, dependency pins, emitted entrypoints, and CI stay synchronized. Do not restore only an old script path or enable a second JavaScript source copy.
