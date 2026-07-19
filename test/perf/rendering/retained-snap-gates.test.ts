/**
 * Permanent structural gates for the GPU pixel-snap payoff: both snap modes are
 * resolved in the vertex shaders from a per-row flag, so the uploaded transform
 * row (and, in geometry mode, the raw quads) stay view-independent and the draw
 * stays eligible for the retained instruction-set tier. These gates pin R2's
 * full closure:
 *
 * - position-snapped sprites inside a RetainedContainer reach the recorded tier
 *   and replay under a camera pan with ZERO instance / transform re-upload,
 * - a position-snapped tilemap node records and splices the same way,
 * - the SAME two scenes in `PixelSnapMode.Geometry` are now equally recordable
 *   (PR 2 moved boundary snapping to the GPU, so geometry no longer poisons),
 * - a transform-only move of a position-snapped DIRECT child fast-patches its
 *   row in place (raw translation + snap flag) without dropping the recording.
 *
 * Real WebGl2Backend + renderers against the recording fake GL context —
 * deterministic, GPU-free, CI-safe.
 */
import { describe, expect, it, vi } from 'vitest';

import { Container } from '#rendering/Container';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { TRANSFORM_FLOATS_PER_ROW } from '#rendering/TransformBuffer';
import type { WebGl2RetainedGroupResources } from '#rendering/webgl2/WebGl2RetainedGroupResources';

import { makeTextures } from './fixtures';
import { createWebGl2Harness, measureFrame, type WebGl2Harness } from './harness';
import { buildTilemapScene, makeTilesets, wireTilemapRenderers } from './tilemapFixtures';

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

const bundleOf = (group: RetainedContainer): WebGl2RetainedGroupResources => fragmentOf(group).instructions!.ownedBundle as WebGl2RetainedGroupResources;

const withHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

/**
 * A fully retained scene: `count` sprites, all in `mode`, inside a single
 * translated RetainedContainer under the root — no live drawable outside the
 * group, so a steady splice frame does zero instance/transform upload.
 */
const buildSnappedScene = (count: number, mode: PixelSnapMode): { root: Container; group: RetainedContainer; inside: Sprite[] } => {
  const [textureA, textureB] = makeTextures(2);
  const root = new Container();
  const group = new RetainedContainer();
  const inside: Sprite[] = [];

  for (let i = 0; i < count; i++) {
    const sprite = new Sprite((i % 2 === 0 ? textureA : textureB)!);

    // Fractional positions so the shader-side snap is doing real work.
    sprite.setPosition(10 + (i % 20) * 3.3, 10 + Math.floor(i / 20) * 3.7);
    sprite.pixelSnapMode = mode;
    group.addChild(sprite);
    inside.push(sprite);
  }

  group.setPosition(200, 200);
  root.addChild(group);

  return { root, group, inside };
};

/**
 * The Slice-3 fast-patch scene: one live sprite OUTSIDE (and before) the group
 * so the group's shared transform rows never start at index 0, plus three
 * direct children inside the group at known group-local positions.
 */
const buildDirectChildScene = (): { root: Container; group: RetainedContainer; inside: Sprite[] } => {
  const [textureA, textureB] = makeTextures(2);
  const root = new Container();
  const outside = new Sprite(textureA!);
  const group = new RetainedContainer();
  const inside = [new Sprite(textureA!), new Sprite(textureB!), new Sprite(textureA!)];

  outside.setPosition(600, 300);
  root.addChild(outside);

  inside[0]!.setPosition(10, 10);
  inside[1]!.setPosition(60, 60);
  inside[2]!.setPosition(110, 110);

  for (const sprite of inside) {
    group.addChild(sprite);
  }

  group.setPosition(200, 200);
  root.addChild(group);

  return { root, group, inside };
};

describe('GPU position pixel-snap: retained recording gates (PR 1)', () => {
  it('position-snapped sprites inside a RetainedContainer reach the recorded tier under camera pan', () => {
    withHarness(harness => {
      const { root, group, inside } = buildSnappedScene(200, PixelSnapMode.Position);

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice (first bind of the group transform texture)

      // The recording exists precisely because a position-snapped draw is
      // recordable now (the whole point of PR 1).
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // A panned frame: the fragment key is view-independent, so the group
      // replays its recorded batches instead of re-collecting.
      const panned = measureFrame(harness, root, () => harness.view.move(1.37, 0.61));

      expect(beginSpy).not.toHaveBeenCalled(); // no re-record
      expect(replaySpy).toHaveBeenCalled(); // instruction replay, not entry replay
      expect(panned.uploadedBufferBytes).toBe(0); // zero instance re-upload
      expect(panned.transformUploads).toBe(0); // rows are view-independent now
      expect(panned.instances).toBe(inside.length);

      root.destroy();
    });
  });

  it('a position-snapped tilemap node inside a RetainedContainer records and splices', () => {
    withHarness(harness => {
      wireTilemapRenderers(harness.backend);

      const scene = buildTilemapScene({ widthTiles: 64, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });

      scene.node.pixelSnapMode = PixelSnapMode.Position;

      const root = new Container();
      const group = new RetainedContainer();

      group.addChild(scene.node);
      root.addChild(group);

      // Fit the whole map so every chunk is visible; inside a retained group
      // per-child culling is disabled, so the whole map records once.
      harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      const panned = measureFrame(harness, root, () => harness.view.move(1.37, 0.61));

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expect(panned.uploadedBufferBytes).toBe(0); // fully retained: zero instance traffic
      expect(panned.transformUploads).toBe(0);

      root.destroy();
    });
  });

  it('geometry-snapped sprites inside a RetainedContainer reach the recorded tier under camera pan', () => {
    withHarness(harness => {
      const { root, group, inside } = buildSnappedScene(200, PixelSnapMode.Geometry);

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      // PR 2 moved boundary snapping into the vertex shaders, so a geometry-
      // snapped draw uploads raw quads + the snap flag and is fully recordable.
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      const panned = measureFrame(harness, root, () => harness.view.move(1.37, 0.61));

      expect(beginSpy).not.toHaveBeenCalled(); // no re-record
      expect(replaySpy).toHaveBeenCalled(); // instruction replay
      expect(panned.uploadedBufferBytes).toBe(0); // zero instance re-upload
      expect(panned.transformUploads).toBe(0); // raw rows are view-independent
      expect(panned.instances).toBe(inside.length);

      root.destroy();
    });
  });

  it('a geometry-snapped tilemap node inside a RetainedContainer records and splices', () => {
    withHarness(harness => {
      wireTilemapRenderers(harness.backend);

      const scene = buildTilemapScene({ widthTiles: 64, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });

      scene.node.pixelSnapMode = PixelSnapMode.Geometry;

      const root = new Container();
      const group = new RetainedContainer();

      group.addChild(scene.node);
      root.addChild(group);

      harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      // Tilemaps snap only their chunk ORIGIN (GPU-side, PR 1) and keep integer
      // chunk-local tile bounds, so geometry mode records exactly like position.
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      const panned = measureFrame(harness, root, () => harness.view.move(1.37, 0.61));

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expect(panned.uploadedBufferBytes).toBe(0);
      expect(panned.transformUploads).toBe(0);

      root.destroy();
    });
  });

  it('a transform-only move of a position-snapped direct child fast-patches without dropping the recording', () => {
    withHarness(harness => {
      const { root, group, inside } = buildDirectChildScene();

      inside[1]!.pixelSnapMode = PixelSnapMode.Position;

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // A pure transform move on a position-snapped direct child: content and
      // structure stay clean, so the group keeps its recording and patches just
      // this child's row — the recorded row carries the RAW translation and the
      // snap flag, and the shader rounds it on the GPU.
      inside[1]!.setPosition(80, 80);

      const patched = measureFrame(harness, root);

      expect(beginSpy).not.toHaveBeenCalled(); // NO re-record: the recording survives
      expect(replaySpy).toHaveBeenCalledTimes(1); // still splicing the instruction set
      expect(patched.instances).toBe(4);
      expect(patched.uploadedBufferBytes).toBe(32); // only the live outside sprite

      // The patched group-local row (inside[1] -> local row 1) holds the raw,
      // UN-snapped position and the Position snap flag (word 6).
      const rows = bundleOf(group).transformTexture!.buffer;
      const stride = TRANSFORM_FLOATS_PER_ROW;

      expect([rows[1 * stride + 4], rows[1 * stride + 5]]).toEqual([80, 80]);
      expect(rows[1 * stride + 6]).toBe(PixelSnapMode.Position);
      // Neighbours untouched (O(k) sub-range patch, not a re-pack).
      expect(rows[0 * stride + 4]).toBe(10);
      expect(rows[2 * stride + 4]).toBe(110);

      root.destroy();
    });
  });
});
