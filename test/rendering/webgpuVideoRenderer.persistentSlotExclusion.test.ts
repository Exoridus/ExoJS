/**
 * WebGPU persistent-slot tier - a root containing `Video` must be refused.
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
 *
 * A second, distinct WebGPU tier - retained-batch recording, gated by
 * `_supportsRetainedBatches` rather than `_supportsPersistentSlots` - is
 * covered further down by its own describe block; see that block's doc
 * comment for why it needs a real plan build instead of the `RenderRootSource`
 * fixture used above.
 */
import { describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { createSourceScope } from '#rendering/plan/renderSourceItem';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { isRetainedFragmentRecordable } from '#rendering/plan/RetainedInstructionSet';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

/**
 * A real `WebGpuBackend` with the core renderer bindings materialized, but
 * never `initialize()`-d against an actual adapter/device - jsdom has none.
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

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

/**
 * A distinct WebGPU tier from the persistent-slot one above: whether a
 * `RetainedContainer`'s captured fragment can be recorded into the WebGPU
 * retained-batch instruction set at all, gated by
 * `RetainedBatchCapableRenderer._supportsRetainedBatches` in
 * `RetainedInstructionSet.ts`. `WebGpuVideoRenderer` never declares that flag
 * either (see its class doc), so a fragment containing a `Video` must never be
 * admitted - the mechanism that keeps a retained video from freezing is that
 * it is never recorded into a retained batch in the first place. This pins
 * that mechanism against a future refactor that copies
 * `_supportsRetainedBatches = true` over from `WebGpuSpriteRenderer`.
 */
describe('WebGPU retained-batch recording: a fragment containing Video', () => {
  test('is never recordable into the retained instruction-set tier', () => {
    const backend = createConnectedBackend();
    const group = new RetainedContainer();
    const texture = new Texture();

    texture.setSize(16, 16);

    const sprite = new Sprite(texture);
    const video = new Video(document.createElement('video'));

    // `cullable = false` sidesteps view-cull bounds math entirely (an
    // unplayed video reports a zero-size texture) - this test only cares
    // whether the capture, once taken, is recordable.
    group.cullable = false;
    sprite.cullable = false;
    video.cullable = false;

    sprite.setPosition(0, 0);
    video.setPosition(32, 0);
    group.addChild(sprite);
    group.addChild(video);

    // A real plan BUILD is what actually populates the fragment's captured
    // entries (RetainedContainer._collectContent runs during it) -
    // hand-building RetainedFragmentEntry records would duplicate that
    // machinery instead of exercising it. Only the build phase is driven
    // directly (not the full `group.render(backend)` build->optimize->play
    // pipeline): this test's backend is never `initialize()`-d against a real
    // adapter, and the play phase issues real GPU calls the stub device
    // cannot service - recordability is decided during build, so play is not
    // needed to observe it.
    const builder = RenderPlanBuilder.acquire();

    try {
      builder.build(group, backend);
    } finally {
      RenderPlanBuilder.release(builder);
    }

    const fragment = fragmentOf(group);

    // Sanity: the capture actually happened and holds both draws, so the
    // recordability check below is not vacuously true over zero entries.
    expect(fragment.hasCapture).toBe(true);
    expect(fragment.entryCount).toBeGreaterThan(0);
    expect(isRetainedFragmentRecordable(fragment.entries, fragment.entryCount, backend)).toBe(false);

    group.destroy();
    backend.destroy();
  });
});
