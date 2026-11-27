import { Mesh } from '#rendering/mesh/Mesh';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import { View } from '#rendering/View';

import { createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

test('a failed view change keeps pending mesh draws on the original camera until retry succeeds', async () => {
  const environment = createMockWebGpuEnvironment();
  const backend = await createMockBackend(environment);
  const camera = View.from({ center: { x: 300, y: 200 }, size: { width: 20, height: 10 }, rotation: 35 });
  const nextCamera = View.from().reset(64, 64, 128, 128);
  const texture = new RenderTexture(2, 2, { format: TextureFormat.Rgba32F, scaleMode: ScaleModes.Linear });
  const mesh = new Mesh({ vertices: new Float32Array([0, 0, 2, 0, 0, 2]), texture });

  try {
    backend.setView(camera);
    backend.draw(mesh);

    expect(() => backend.setView(nextCamera)).toThrow('float32-filterable');
    expect.soft(backend.view).toBe(camera);
    expect(environment.drawIndexedCount()).toBe(0);

    texture.scaleMode = ScaleModes.Nearest;
    const acquirePass = vi.spyOn(backend.passCoordinator, 'acquirePass');

    backend.setView(nextCamera);

    expect(environment.drawIndexedCount()).toBe(1);
    expect(acquirePass.mock.results.some(result => result.type === 'return' && result.value.view === camera)).toBe(true);
    expect(backend.view).toBe(nextCamera);
    backend.flush();
    expect(environment.drawIndexedCount()).toBe(1);
  } finally {
    vi.restoreAllMocks();
    texture.scaleMode = ScaleModes.Nearest;
    backend.destroy();
    mesh.destroy();
    texture.destroy();
    camera.destroy();
    nextCamera.destroy();
    environment.restore();
  }
});
