# Packaging dependency security

The scoped pnpm overrides for `@electron/asar@4.3.1` select minimatch 11.0.3
and glob 14.0.3. The parent still declares minimatch 10 and glob 13; a normal
parent update cannot resolve [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Glob 14 declares minimatch 11 support, so both dependencies move together.
The overrides affect this exact ASAR parent version, rather than every matcher.

`test/asar-packaging.test.ts` resolves the actual Electron packager dependency
chain. It checks the preprocessing expansion limit, ordinary matching, and seven
archive selection/unpacking cases including file bytes and symlink metadata.

Remove or reevaluate both overrides when upgrading ASAR. Prefer a parent release
that declares fixed compatible dependencies, then rerun the ASAR test, full
lockfile audit, packaging and native acceptance. Do not retain stale exceptions
without checking the newly resolved dependency graph.
