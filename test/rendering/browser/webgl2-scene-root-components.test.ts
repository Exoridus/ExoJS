/**
 * Default root rendering, custom draw overrides, transitions and components on
 * WebGL2 - the scenario lives in `_sceneRootScenario.ts` and runs unchanged on
 * WebGPU as well.
 *
 * Run via:  pnpm test:browser:webgl
 */
import { runSceneRootScenario } from './_sceneRootScenario';

describe('WebGL2 scene root and components', () => {
  test('default draw, overrides, UI, behaviours and transitions render as specified, without errors', async ctx => {
    const result = await runSceneRootScenario('webgl2', ctx);

    expect(result.errors).toEqual([]);
  });
});
