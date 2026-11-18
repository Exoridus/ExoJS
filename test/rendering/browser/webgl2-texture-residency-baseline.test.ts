import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { RESIDENCY_SURFACE_SIZE, verifyTextureResidencyBaseline } from './_textureResidencyBaseline';

test('WebGL2 shares one decode across samplers and records GPU texture residency', async () => {
  const backend = await createWebGl2TestBackend(RESIDENCY_SURFACE_SIZE);
  const gl = backend.context;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const adapter = String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER));

  try {
    await verifyTextureResidencyBaseline({
      adapter,
      sharesTexture: true,
      bytes: () => backend.stats.gpuMemoryBytes,
      bind: texture => {
        backend.bindTexture(texture, 0);
        const sampler = gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null;

        expect(sampler).not.toBeNull();

        backend.bindMaterialSampler({ scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.MirroredRepeat }, 0);
        expect(gl.getParameter(gl.SAMPLER_BINDING)).not.toBe(sampler);

        backend.unbindMaterialSampler(0);
        expect(gl.getParameter(gl.SAMPLER_BINDING)).toBe(sampler);
      },
      draw: async root => {
        renderWebGl2Once(backend, root);

        return (x, y) => readWebGl2Pixel(backend, x, y);
      },
    });
  } finally {
    backend.destroy();
  }
});
import { ScaleModes, WrapModes } from '#rendering/types';
