/**
 * DropShadowFilter's authored shadow colour is decoded from sRGB to linear
 * once on CPU, gated behind COLOR_PIPELINE_ENABLED like every other colour
 * pipeline behavioural change (see drop-shadow-filter.test.ts for the
 * gate-closed default). This file flips the gate and proves the linear path.
 */
import { srgbToLinear } from '#core/colorTransfer';

vi.mock('#rendering/colorPipelineActivation', () => ({ COLOR_PIPELINE_ENABLED: true }));

interface ShadowUniformPeek {
  _silhouette: { uniforms: { uColor: { x: number; y: number; z: number; w: number } } };
}

describe('DropShadowFilter shadow colour with the colour pipeline active', () => {
  test('the shadow uniform is linear-light, not straight sRGB', async () => {
    const { Color } = await import('#core/Color');
    const { DropShadowFilter } = await import('#rendering/filters/DropShadowFilter');

    const filter = new DropShadowFilter({ color: new Color(128, 0, 0, 0.5) });
    const uColor = (filter as unknown as ShadowUniformPeek)._silhouette.uniforms.uColor;

    expect(uColor.x).toBeCloseTo(srgbToLinear(128 / 255), 6);
    expect(uColor.y).toBe(0);
    expect(uColor.z).toBe(0);
    expect(uColor.w).toBe(0.5);
    filter.destroy();
  });
});
