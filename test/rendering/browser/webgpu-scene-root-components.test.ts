/**
 * The WebGL2 scene-root scenario on WebGPU - see `_sceneRootScenario.ts`. A
 * browser without a WebGPU adapter skips with the reason; it never passes.
 *
 * Run via:  pnpm test:browser:webgpu
 */
import { runSceneRootScenario } from './_sceneRootScenario';

describe('WebGPU scene root and components', () => {
  test('default draw, overrides, UI, behaviours and transitions render as specified, without errors', async ctx => {
    const result = await runSceneRootScenario('webgpu', ctx);

    expect(result.errors).toEqual([]);
  });
});
