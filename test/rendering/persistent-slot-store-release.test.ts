import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2PersistentSlotStore } from '#rendering/webgl2/WebGl2PersistentSlotStore';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuPersistentSlotStore } from '#rendering/webgpu/WebGpuPersistentSlotStore';

/**
 * A released slot store must stop being reachable from the backend: roots that
 * come and go would otherwise accumulate dead stores for the backend's life.
 */
describe('persistent slot store registry', () => {
  const source = { prepack: () => true } as unknown as RenderRootSource;

  const acquireAndDestroy = (
    acquire: (this: unknown, source: RenderRootSource) => { destroy?(): void } | null,
    make: () => { destroy(): void },
  ): number => {
    const registry = new Set<unknown>();
    const owner = { _acquirePersistentSlotStore: make };
    const backend = { _persistentStores: registry, _resolvePersistentSlotOwner: () => owner };

    for (let i = 0; i < 3; i++) {
      acquire.call(backend, source)!.destroy!();
    }

    return registry.size;
  };

  test('WebGL2 backend drops a destroyed store', () => {
    expect(acquireAndDestroy(WebGl2Backend.prototype._acquirePersistentSlots, () => new WebGl2PersistentSlotStore())).toBe(0);
  });

  test('WebGPU backend drops a destroyed store', () => {
    expect(acquireAndDestroy(WebGpuBackend.prototype._acquirePersistentSlots, () => new WebGpuPersistentSlotStore())).toBe(0);
  });
});
