# Reproduce victory summaries

Run the real victory settlement and summary without playing a full match:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec install-electron
pnpm prepare:game
node e2e/victory.ts
```

The runner launches Electron with a disposable user-data directory. It does not
read or change an installed game's saves. It closes its window and removes its
temporary profile on success or failure. A prepared game directory can be passed
as an argument: `node e2e/victory.ts build/game`.

The scenarios use Charmander in Forest/Normal and Mewtwo in Iris/Nightmare.
After gameplay becomes ready, they seed final-stage run outcomes: captures,
shiny and classic-shiny captures, defeated species, move damage and item damage.
They call the production `finish(true, false)` method, which builds the result,
settles it through the local backend, and renders the actual summary. No summary
HTML, result renderer or backend response is mocked.

Checks cover:

- The victory heading, portrait, capture categories, defeated-species portraits
  and damage icons actually render.
- Every summary image and CSS background decodes, including backgrounds on
  pseudo-elements. Missing asynchronous image sources have a bounded wait.
- No failed image request, HTTP error or uncaught page error occurs.
- The lower-left missing-graphics notice stays absent after its real eight-second
  delay. Visible images alone are insufficient: the upstream capturing error
  listener retains retry entries even if the image source is restored.
- A victorious result reaches local history, and the normal scenarios return to
  the menu using the visible button.

Screenshots and failure details are written to `evidence/victory-*.png` and
`evidence/victory-failure.json`. Successful runs write `evidence/victory.json`.

## Verify that the checks detect failures

```sh
VICTORY_CHECK_NEGATIVE=1 node e2e/victory.ts
```

After the normal scenarios pass, the negative control replaces the final summary's
portrait with a fresh image element. A corrupt PNG and a missing local URL must
both fail the decoder. The missing URL must produce a recorded 404 and the real
lower-left missing-graphics notice. The runner captures that notice, restores a
valid source and checks decoding again. Closing the disposable Electron process
clears the upstream retry queue. Injected failures are expected only inside this
control; normal scenario failures still fail the command. The existing
`e2e/electron.ts` suite runs this mode, including packaged-app CI, in a separate
Electron process and profile so injected failures do not contaminate other checks.

The fresh element removes per-element handlers that could restore a portrait
before decoding. The document-level upstream error listener remains active, so
the delayed notice and retries use production wiring.

## Evidence limits

This is a result-screen regression, not a simulation of defeating the final
boss. It bypasses combat, elapsed gameplay and map transitions. It does not cover
every character, cosmetic, ally, research reward, event or game mode. The checked
scenarios cannot guarantee that all other combinations are complete. It runs the
prepared source game in Electron; Android and installed release binaries require
separate runs. A negative control establishes detection, not the cause of a
player's original notice.

## Release isolation

The runner, scenario mutations and fault injection live only under `e2e/`. No
production module imports them, and the desktop/runtime build configurations do
not emit them. Screenshots stay under the ignored `evidence/` directory; profiles
use operating-system temporary storage and are removed by the runner. The
missing-image control uses a nonexistent URL and a data URL, not a fixture copied
into the game directory.

`scripts/package-electron.ts` assembles its app from the compiled desktop entry,
LICENSE and a generated package descriptor, then copies the prepared game into
its resources. `scripts/stage-android.ts` copies only the prepared game and its
launcher icon. Neither takes `e2e/`, documentation, evidence or test profiles as
input. Preparing and verifying the game, then checking the emitted desktop and
Android staging trees, confirms the test files are absent from those inputs; it
does not substitute for building and inspecting every release archive.
