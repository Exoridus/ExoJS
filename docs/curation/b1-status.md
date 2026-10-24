# B1 animation, graphics and bitmap text

This slice implements targets 20, 21, 22 and 24 on foundation `84d7dbe4fa63f7a7e45b65f2f5bf49cefac95d46`. Targets 19 and 23 remain the separate pilot. The authoritative target count is 48.

| Target                  | Runnable source                                   | Implemented contract                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20 Tweens and Easing    | `examples/tweens-animation/tween-basics.ts`       | All 31 built-in eases, raw-time/eased-progress plot with overshoot margin, click-to-move and replacement, One-way/Roundtrip/four-leg Route, pause/resume, reset and keyboard ease selection. |
| 21 Impact Feedback      | `examples/showcase/screen-shake-on-explosion.ts`  | Kenney wooden block on grass; pointer/Space triggers one particle burst, tint flash and short view shake; R resets particles, tint, shake and event count.                                   |
| 22 Shapes and Gradients | `examples/geometry-graphics/graphics-gradient.ts` | Quiet labeled 3x2 shape grid; Linear/Radial fill, captured draggable A/B endpoints, keyboard handle movement and reset.                                                                      |
| 24 Bitmap Text          | `examples/text-fonts/bitmap-text-basic.ts`        | Loaded Kenney Blocks atlas, live counter, 1x/2x/3x/2.5x scale and the same word rendered with browser Text alongside it; pause/resume and reset.                                             |

The examples use existing public `Scene.track`, `Scene.tweens`, `Scene.inputs`, `ActionMap`, `Graphics`, `Spritesheet`, `View`, `BitmapText`, `Text`, particles and shared caption/control helpers. The curve is rebuilt only for a changed layout or easing. Reset preserves the user's pause state for the tween and bitmap examples. The bitmap counter advances by elapsed time in tenths of a second.

## Validation

Each browser result contains two exact presentation sizes (1280x720 and 512x288), startup and interaction captures, requested-backend verification, meaningful parameter/state assertions, caption type and interactive hit-area measurements, hidden-preview recovery, scene replacement and disposal. Backend fallback is not accepted as a pass.

| Environment     | Target/size cases | Evidence                                                |
| --------------- | ----------------- | ------------------------------------------------------- |
| Chromium WebGL2 | 8                 | [Result JSON](evidence/b1/chromium-webgl2-results.json) |
| Chromium WebGPU | 8                 | [Result JSON](evidence/b1/chromium-webgpu-results.json) |
| Firefox WebGL2  | 8                 | [Result JSON](evidence/b1/firefox-webgl2-results.json)  |

Focused checks: `pnpm typecheck:examples` (exit 0); `pnpm exec exo-tsc --noEmit --pretty false -p site/tsconfig.scripts.json` (exit 0); ESLint on the four target TypeScript sources, batch script and named test (exit 0); `pnpm exec vitest run test/examples/curation-b1.test.ts --project=exojs` (4 passed, exit 0); `pnpm exec vitest run test/site/examples-sync.test.ts --project=exojs` (1 passed, exit 0); site `examples:sync` and `vendor:sync` (exit 0). The sync guard first detected stale tween JavaScript, then passed after regeneration. The four newly added behavior/material tests provide new coverage; no historical red-green bug-fix claim is made.

Browser reproduction: `pnpm exec tsx site/scripts/curation-b1-e2e.ts --browser chromium --backend webgl2 --shots docs/curation/evidence/b1`, with `--backend webgpu` or `--browser firefox --backend webgl2` for the other environments. The local site runs on port 4322. The source hashes in [the manifest](evidence/b1/source-sha256.json) identify the implementation used by these captures.

`pnpm lanes --base 84d7dbe4fa63f7a7e45b65f2f5bf49cefac95d46` was run before the first push. New evidence/tooling paths conservatively select all integration lanes; targeted example, script, sync and renderer responsibilities were checked directly before the enabled push hook.

## Migration and collision boundaries

The host for target 20 now serves the `tween-basics`, `tween-chains` and `easing-curves` learning contracts. Both donor sources remain runnable and unchanged. Shared gallery labels, aliases, prerequisite/next links and guide migrations are owned by the central rollout. No source or route was deleted.

Target 21 overlaps Draft PR #866 at `examples/showcase/screen-shake-on-explosion.ts`. This slice independently owns its pointer handler, render nodes, view, particles and tint tween through existing public APIs; it does not copy or merge #866 engine/shared repairs. Scene replacement assertions verify unchanged handler counts and destroyed owned resources. Integration must reconcile the example-file collision deliberately.

Bitmap wrap/kerning reference material and text underline/alignment/line-height contracts remain central guide responsibilities under R09; they are not extra controls in target 24. R12 navigation links remain central metadata work.

## Limits

Firefox WebGPU was not run because the available Firefox environment has no supported adapter. Real touch/gamepad hardware and human listening were not tested. Optional impact audio is not enabled: the coordinated visual effect does not depend on the outstanding M1-M4 audio material/acceptance. Existing Kenney/technical assets are used without downloads or asset changes. Catalog-wide migration and all-48 acceptance are outside this slice.
