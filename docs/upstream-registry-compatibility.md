# Pokédex registry discovery

The offline patcher must identify exactly one registry instance before injecting the local backend. An absent or ambiguous registry stops the build instead of producing an app with an unresolved backend reference.

## Observed upstream change

On October 28, 2026 (Asia/Taipei), scheduled builds at builder commit `be2cbd9fcfd9bd97c73ad0d9de3e73c8e0e7012c` failed with `Unsupported upstream: Pokédex registry: expected one match, got 0`. Both the [first failed scheduled run](https://github.com/VdustR/pokebonk-offline/actions/runs/40415564614) and the [latest investigated run](https://github.com/VdustR/pokebonk-offline/actions/runs/40642515798) failed at that boundary.

The [upstream application module for build mvr5gbc0](https://pokebonk.com/assets/main-BOn5p88k-mvr5gbc0.js) initializes its registry fields through constructor helper calls: `A(this,` followed by the field key and initial value. Earlier fixtures use native class fields. The old raw-source check for `pokemon=[]` rejected the constructor form, although the registry still has an empty Pokémon array and a `movesByKey` Map.

Discovery now uses the existing Acorn syntax tree to recognize those two initialization forms without depending on whitespace, quote style, or minified helper names. It requires an instance array initialized empty and a Map constructed without arguments; static fields, unrelated receivers, missing fields, incompatible values, and duplicate registries remain unsupported. This is a narrow compatibility adapter, not a general JavaScript class evaluator.

## Reproduce and validate

Download the application module linked above and its same-build `defineProperty-CGpGi5J6-mvr5gbc0.js` configuration module. Call `inspectGame(main, config)` from `scripts/patch-game.ts` with their UTF-8 contents. This directly exercises the failed boundary without downloading the asset catalog or launching Electron.

The original matcher failed, the repaired matcher resolved the registry and the other patch bindings, and temporarily restoring the original matcher restored the same failure. `test/semantic.test.ts` retains reduced cases for both supported forms, renamed bindings, and nearby rejection cases. The full `prepare:game`, payload verifier, and native CI remain necessary to establish that the downloaded game can be patched, packaged, and played offline.

Repeat the direct inspection when upstream changes the registry initialization or module layout. These observations establish compatibility with the inspected build; they do not guarantee compatibility with future upstream releases.
