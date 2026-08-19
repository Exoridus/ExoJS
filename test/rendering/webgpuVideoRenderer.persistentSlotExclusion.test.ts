/**
 * WebGPU persistent-slot tier — a root containing `Video` must be refused.
 *
 * `WebGpuBackend._acquirePersistentSlots` walks every item in a
 * `RenderRootSource` and requires every resolved renderer to declare
 * `_supportsPersistentSlots === true`, sharing one owner renderer across the
 * whole root. `WebGpuVideoRenderer` never declares that flag, so a root
 * mixing a `Video` with an otherwise-eligible `Sprite` must fall through to
 * the ordinary draw path rather than being admitted to the indexed tier.
 *
 * This pins the existing mechanism rather than adding a new one: nothing in
 * `WebGpuVideoRenderer` opts in today, so this test exists to catch a future
 * refactor that copies `_supportsPersistentSlots = true` over from
 * `WebGpuSpriteRenderer` without noticing the consequence.
 */
import { describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { createSourceScope } from '#rendering/plan/RenderSourceItem';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

/**
 * A real `WebGpuBackend` with the core renderer bindings materialized, but
 * never `initialize()`-d against an actual adapter/device — jsdom has none.
 *
 * `_acquirePersistentSlots` only gates on device PRESENCE (`_device === null`
 * / `_deviceLost`); the renderer-eligibility walk it guards makes no device
 * calls, so a non-null stub is enough to reach it. `WebGpuBackend.destroy()`
 * is explicitly written to tolerate a device with no `destroy` method for
 * exactly this kind of jsdom double.
 */
const createConnectedBackend = (): WebGpuBackend => {
  const app = {
    canvas: document.createElement('canvas'),
    options: { canvas: { width: 128, height: 128 } },
  } as unknown as Application;
  const backend = new WebGpuBackend(app);

  materializeRendererBindings(backend, buildCoreRendererBindings({}));
  (backend as unknown as { _device: unknown })._device = {};

  return backend;
};

describe('WebGPU persistent slots: a root containing Video', () => {
  test('never acquires the persistent-indexed tier, mixed with an eligible Sprite', () => {
    const backend = createConnectedBackend();
    const sprite = new Sprite(Texture.empty);
    const video = new Video(document.createElement('video'));

    const rootScope = createSourceScope();

    rootScope.items.push(sprite, 0, 0, 0, 0, 16, 16);
    rootScope.items.push(video, 1, 0, 32, 0, 48, 16);

    const source = new RenderRootSource();

    source.adopt(rootScope, 0, 0, 0, 0);

    expect(backend._acquirePersistentSlots(source)).toBeNull();

    video.destroy();
    sprite.destroy();
    backend.destroy();
  });

  /**
   * Isolated from the mixed-root case above on purpose: a root that mixes
   * Video with a persistent-slot-capable Sprite is excluded by the
   * single-owner-renderer rule regardless of Video's own flag (a Sprite and a
   * Video item never resolve to the same renderer instance), so that shape
   * alone would keep passing even if `WebGpuVideoRenderer` regressed to
   * declaring `_supportsPersistentSlots = true`. A Video-only root removes
   * that confound: it is the shape that actually exercises the flag check
   * without the owner-uniqueness rule masking a regression.
   */
  test('never acquires the persistent-indexed tier, alone', () => {
    const backend = createConnectedBackend();
    const video = new Video(document.createElement('video'));

    const rootScope = createSourceScope();

    rootScope.items.push(video, 0, 0, 0, 0, 16, 16);

    const source = new RenderRootSource();

    source.adopt(rootScope, 0, 0, 0, 0);

    expect(backend._acquirePersistentSlots(source)).toBeNull();

    video.destroy();
    backend.destroy();
  });
});
