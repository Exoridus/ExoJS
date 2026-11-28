/**
 * A JSX-built hierarchy against the same hierarchy built with constructors on
 * WebGPU - the scenario lives in `_jsxComposition.tsx` and runs unchanged on
 * WebGL2 as well.
 *
 * Run via:  pnpm test:browser:webgpu
 */
import { runJsxComposition } from './_jsxComposition';

describe('WebGPU JSX construction parity', () => {
  test('renders the same pixels, draw calls and node count as the imperative tree', async ctx => {
    const result = await runJsxComposition('webgpu', ctx);

    expect(result.errors).toEqual([]);
    expect(result.declared.nodes).toBe(result.imperative.nodes);
    expect(result.declared.drawCalls).toBe(result.imperative.drawCalls);
    expect(result.declared.drawCalls).toBeGreaterThan(0);

    const differing = result.declared.pixels.findIndex((value, index) => value !== result.imperative.pixels[index]);

    expect(differing, 'first differing byte').toBe(-1);
    expect(
      result.declared.pixels.some((value, index) => index % 4 !== 3 && value !== 0),
      'the scene drew something',
    ).toBe(true);
  });
});
