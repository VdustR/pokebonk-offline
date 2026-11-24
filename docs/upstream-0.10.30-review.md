# Upstream 0.10.30 resource and adapter review

Observed November 24, 2026 (Asia/Taipei): the official game reports 0.10.30,
build `mwurkthy`. The accepted comparison input is 0.9.24, build `mwc3y990`.
The [update tracker and its discussion](https://github.com/VdustR/pokebonk-offline/issues/50)
distinguish version detection from snapshot acceptance. Its recovered historical
discovery observation supplies no reason to change the 48-module guard. The game
page has no public comment section; Discord discussion was not accessed.

## Source ownership and catalogs

The application now boots a named instance without exporting `App`. Assets,
cosmetics, profile helpers and the Pokédex registry occupy separate modules.
The previous application-export matcher rejects these bytes. Evaluating the
whole assets module also reaches unrelated browser instrumentation instead of
just the configuration.

The adapter follows lexical bindings and actual import/export ownership. It
uses [ESLint's scope analyzer](https://eslint.org/docs/latest/extend/scope-manager-interface)
with the existing Acorn parser rather than inferring references from minified
identifier spelling. Catalog evaluation includes only selected declaration
dependencies and their ordered top-level assembly statements in an isolated VM
with dynamic code generation disabled. Translation presentation calls are
replaced only for the recognized i18n import; arbitrary browser imports are not
stubbed. Required catalog schemas still reject missing or ambiguous results.

Catalog assembly also crosses module boundaries: cosmetics appends mastery
achievements through an imported alias, and profile helpers adjust a goal.
The owner-only list has 129 entries; the assembled list has 438. A dedicated
regression verifies imported-alias mutations and the final values.

Assembly order matters: the roster is extended, sorted and filtered after its
initial declaration. Reading only that declaration incorrectly returns 40
members; preserving assembly returns 138. The season-four domain remains capped
at species 251, with 438 assembled achievement entries and three event declarations.
The score alias follows the application's actual `record.score` producer;
the new assets module contains two superficially similar result calculators.
The generated backend imports each binding from its real owner, and source
patches remain in their original modules. No whole-game rebundling is introduced.

## Resource domains

The independent review collects the complete discovered module/style/font graph,
actual JSON import targets, 17 versioned data/localization catalogs, 28 versioned
environment atlases and the mythic rig JSON. A translation mapping key such as
`./de.json` is not itself a resource declaration: the hashed import target is
collected. Acquisition therefore follows JSON import syntax instead of guessing
from every JSON-looking string.

New finite domains include 41 form sprite sheets, 40 declared form portraits,
eight badge images, ten regional map previews, the mythic appearance's models,
rig and species/portrait images, expedition factions, pass reward kinds, refuge
levels, and terrain tile sets selected by biome shape, panorama layers and positioned scene
model catalogs and terrain landmark calls. These include later Boss Rush room props and Safari resources,
not only the resources requested in the first room. Map-marker icon names follow
their actual URL factory. Declared treasure rewards add frame, banner and glow-layer files alongside
their wheel backgrounds. Preparation-only items use their declared icon fallback
even when no corresponding items JSON entry exists. Goal, status and reaction icons follow
their real catalogs; multiple renderers must resolve the same catalog owner.
Unknown dynamic icon prefixes still reject acquisition. Interactable model
dictionaries are identified through their actual model-loader calls, which
distinguishes a similarly shaped icon dictionary. Music tracks follow the
loop metadata in the audio module. The initial native run detected missing
`dojo`, `power` and `dynamax-menu` files; those finite domains are now required
independently of the candidate manifest.

The friends route is now a separate lazy module; the existing offline-only
notice follows the actual route owner. The resource-version table matches the
retained 0.10.29 candidate exactly. Its verified bytes are reused only for
identical explicit versioned URLs. A live-build change was rejected before
collection; the final snapshot must identify 0.10.30 throughout.

The contract retains previous stable required paths and updates the versioned
source graph and pristine input hashes. Its baseline has 121 inputs and 3,976
required paths. It is built from the independent source/catalog review, before
candidate acquisition, rather than from a downloaded candidate's manifest.

A renderer's model label alone is not a GLB declaration. Versioned official GETs
for the inferred `bill`, `exp`, `tower` and `rush` GLBs return 404, while the new
Furia boat GLB returns valid model bytes. Procedural/fallback model candidates
remain optional; previously required files remain mandatory. Likewise, typed
cosmetic IDs such as `frame:s3c-1` cannot be interpreted as bare avatar names.
The collector retains its path validation and uses the declared resource domain.

The offline event response includes empty event, weekly and clan boards required
by the Boss Rush screen. It invents no rankings and writes no profile data. Its
regression preserves rejection of unsupported online operations. All 12 treasure
wheels and mythic appearance IDs are included in the generated unlock inventory;
native checks read that inventory and verify the actual profile and every wheel
background.

## Verification boundary

Focused checks exercise lexical shadowing and imports, missing bindings,
unavailable browser effects, ordered roster assembly, shared frame catalogs,
new icon catalog entries, unknown icon prefixes, unsafe form paths, dynamic
resource families, and treasure frame/banner omissions. The item-shop check
also separates priced species appearances from ordinary item entries.

Offline preparation, payload verification, current-snapshot rejection controls,
and packaged native acceptance are required before publication. Published
artifact identities and installation are separate delivery gates. Native Mac
acceptance does not establish physical Android, Windows, Linux or Intel Mac
behavior, every remote social state, or successful resumption of an older saved
run; an existing saved-run summary must be preserved during installation.

The accepted candidate contains 4,228 pristine files (snapshot digest
`46d19327cbc7bc4b4f1a08bc99f853c164d8681e841a521e0f5776283f92ad07`).
Network-denied preparation produces 4,231 payload files; all hashes pass.
Native Mac acceptance passes all 12 gameplay scenarios, every treasure wheel,
profile unlocks, victory settlement, manual/autosave process restart and recovery,
corrupt-storage preservation, and network isolation with no missing requests or
renderer errors. A separate focused run exercises Furia, Plateado and New Island
Boss Rush for more than five seconds each. Packaged acceptance repeats the checks
against the exact release executable and embedded payload before publication.
