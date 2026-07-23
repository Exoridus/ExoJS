/**
 * Structural gates for the WebGL2 retained instruction-set tier (Track B
 * Slice 3, Tasks 6/7): the real WebGl2Backend + sprite renderer run against
 * the recording fake GL context, driving the full collect ladder
 * (capture -> record -> splice) through `root.render(backend)` exactly like
 * production. Deterministic, GPU-free, CI-safe.
 *
 * What these pin, per S3-D1/S3-D4:
 * - the record frame captures the DEFAULT-path sprite flushes byte-identical
 *   (instance words land in the group bundle, node indices rebased group-local),
 * - the splice frame replays O(batches) with ZERO instance re-upload and zero
 *   transform-texture traffic (the headline win over layer 4 in the design),
 * - stats parity (batches / drawCalls / submittedNodes) across the tiers,
 * - group/camera motion replays without recapture; child mutation recaptures,
 * - device restore + destroy invalidate and free the group resources.
 */
import { describe, expect, it, vi } from 'vitest';

import { Container } from '#rendering/Container';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { RetainedInstructionSet } from '#rendering/plan/RetainedInstructionSet';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import type { WebGl2RetainedGroupResources } from '#rendering/webgl2/WebGl2RetainedGroupResources';

import { makeTextures } from './fixtures';
import { createWebGl2Harness, measureFrame, type WebGl2Harness } from './harness';

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
 * One sprite OUTSIDE (and before) the retained group so the group's shared
 * transform rows never start at 0 — the group-local index rebase (S3-D4) is
 * load-bearing in every cell, not incidentally satisfied.
 */
const buildScene = () => {
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

  return { root, outside, group, inside, textureA: textureA!, textureB: textureB! };
};

describe('WebGL2 retained instruction set: record + splice ladder (Tasks 6/7)', () => {
  it('walks capture -> record -> splice; the steady splice frame re-uploads ZERO instance bytes', () => {
    withHarness(harness => {
      const { root, group } = buildScene();
      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // F1 — dirty first frame: full collect + fragment capture, no recording
      // (record-on-first-clean-frame policy), no replay.
      const f1 = measureFrame(harness, root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).not.toHaveBeenCalled();
      expect(f1.drawCalls).toBe(2); // outside batch + group batch (flush boundary at the group)
      expect(f1.instances).toBe(4);
      expect(f1.visibleNodes).toBe(4);

      // F2 — first clean frame: entry replay + instruction recording. Still
      // draws through the normal path (same draw shape as F1); additionally
      // uploads the recorded bytes into the group bundle once.
      const f2 = measureFrame(harness, root);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(replaySpy).not.toHaveBeenCalled();
      expect(f2.drawCalls).toBe(2);
      expect(f2.instances).toBe(4);
      expect(f2.visibleNodes).toBe(4);
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      // F3 — splice: the group replays from its instruction set. The group's
      // transform DataTexture uploads once here (first bind after finalize).
      const f3 = measureFrame(harness, root);

      expect(beginSpy).toHaveBeenCalledTimes(1); // no re-record
      expect(replaySpy).toHaveBeenCalledTimes(1); // one recorded batch (16-slot merge)
      expect(f3.drawCalls).toBe(2);
      expect(f3.instances).toBe(4);
      expect(f3.visibleNodes).toBe(4);

      // F4 — steady splice: NOTHING uploads for the group anymore. The only
      // buffer traffic is the live outside sprite's own 36-byte re-pack; the
      // shared transform texture is unchanged (hash) and the group texture is
      // clean (version) — zero texture uploads of any kind.
      const f4 = measureFrame(harness, root);

      expect(f4.drawCalls).toBe(2);
      expect(f4.batches).toBe(2);
      expect(f4.instances).toBe(4);
      expect(f4.visibleNodes).toBe(4); // stats parity: replay bumps submittedNodes from the descriptor
      expect(f4.uploadedBufferBytes).toBe(32); // ONLY the live outside sprite
      expect(f4.transformUploads).toBe(0);
      expect(f4.bufferUploads).toBe(1);

      root.destroy();
    });
  });

  it('rebases recorded node indices group-local and copies the group-relative transform rows (S3-D4)', () => {
    withHarness(harness => {
      const { root, group } = buildScene();

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record

      const bundle = bundleOf(group);
      const words = bundle.instanceWords;

      // 3 instances of 8 words each; word 7 is the node index. The outside
      // sprite occupied shared row 0, so the group's rows started at 1+ —
      // after the rebase they MUST read 0..2.
      expect(bundle.usedWords).toBe(3 * 8);
      expect([words[0 * 8 + 7], words[1 * 8 + 7], words[2 * 8 + 7]]).toEqual([0, 1, 2]);

      // The group-owned transform store holds the GROUP-RELATIVE transforms
      // (getGlobalTransform stops at the boundary): translation = the child's
      // own position, not the group-lifted world position.
      const rows = bundle.transformTexture!.buffer;

      expect(bundle.transformRowCount).toBe(3);
      expect([rows[0 * 12 + 4], rows[0 * 12 + 5]]).toEqual([10, 10]);
      expect([rows[1 * 12 + 4], rows[1 * 12 + 5]]).toEqual([60, 60]);
      expect([rows[2 * 12 + 4], rows[2 * 12 + 5]]).toEqual([110, 110]);

      root.destroy();
    });
  });

  it('patches the correct store row when the group base shifts between capture and record (CRITICAL-2 regression)', () => {
    withHarness(harness => {
      const { root, outside, group, inside } = buildScene();

      // F1 (capture): `outside` is visible and occupies shared row 0, so the
      // group's children capture at rows 1,2,3 (groupBase = 1).
      measureFrame(harness, root);

      // Between capture and record, hide `outside`. This does NOT dirty the
      // group (a sibling's structure change is off the group's subtree), so the
      // group stays clean and records on F2 — but now its children start at row
      // 0 (groupBase shifts 1 -> 0). The node->row map still holds the F1
      // indices (1,2,3); the store is rebased to the F2 base (0). The patch must
      // use the F1 subtree-local origin, not the F2 bundle base, or every
      // patched row is off by the base delta.
      outside.visible = false;

      measureFrame(harness, root); // F2 record (shifted base)
      measureFrame(harness, root); // F3 splice

      const bundle = bundleOf(group);

      // Sanity: with `outside` hidden the group owns exactly its 3 rows from 0.
      expect(bundle.transformRowCount).toBe(3);

      // Move the FIRST inside child; it must land in store row 0 (its group-
      // local position), not row 1 (which the off-by-base bug would target).
      measureFrame(harness, root, () => inside[0]!.setPosition(99, 99));

      const rows = bundle.transformTexture!.buffer;

      expect([rows[0 * 12 + 4], rows[0 * 12 + 5]]).toEqual([99, 99]); // moved child
      expect([rows[1 * 12 + 4], rows[1 * 12 + 5]]).toEqual([60, 60]); // untouched
      expect([rows[2 * 12 + 4], rows[2 * 12 + 5]]).toEqual([110, 110]); // untouched

      root.destroy();
    });
  });

  it('camera pan and group move replay WITHOUT recapture (the Wave-4 win survives the fast tier)', () => {
    withHarness(harness => {
      const { root, group } = buildScene();

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // Camera pan: the fragment key is view-independent; replay stages the
      // live projection.
      const panned = measureFrame(harness, root, () => harness.view.move(4, 0));

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(1);
      expect(panned.instances).toBe(4);

      // Group move: only the group matrix changes (decoupled from the content
      // revision); the replayed batch follows via the live `u_group`.
      const moved = measureFrame(harness, root, () => group.setPosition(240, 240));

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(2);
      expect(moved.instances).toBe(4);
      expect(moved.uploadedBufferBytes).toBe(32); // still only the live outside sprite

      root.destroy();
    });
  });

  it('a child mutation invalidates the set, falls back to full collect, and re-records with fresh data', () => {
    withHarness(harness => {
      const { root, group, inside } = buildScene();

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record

      const firstGeneration = bundleOf(group).generation;

      measureFrame(harness, root); // F3 splice

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // Content mutation (Slice 4b: a bare move would be row-patched instead —
      // exercised by the fast-patch gate below): content-dirty wins, so the
      // dirty frame is a plain collect — no replay, no capture. The move rides
      // along so the re-recorded row still carries fresh position data.
      inside[1]!.invalidateContent();
      inside[1]!.setPosition(80, 80);

      const dirty = measureFrame(harness, root);

      expect(replaySpy).not.toHaveBeenCalled();
      expect(beginSpy).not.toHaveBeenCalled();
      expect(dirty.drawCalls).toBe(2);
      expect(dirty.instances).toBe(4);

      // Next clean frame: entry replay + re-record (bundle rewritten -> new
      // generation), then the frame after splices the fresh recording.
      measureFrame(harness, root);

      expect(beginSpy).toHaveBeenCalledTimes(1);

      const bundle = bundleOf(group);

      expect(bundle.generation).toBeGreaterThan(firstGeneration);
      expect(bundle.transformTexture!.buffer[1 * 12 + 4]).toBe(80); // fresh row data

      const spliced = measureFrame(harness, root);

      expect(replaySpy).toHaveBeenCalledTimes(1);
      expect(spliced.instances).toBe(4);

      root.destroy();
    });
  });

  it('a texture RESIZE inside the group fails collect-time validation, falls back and re-records the same frame (S3-D3)', () => {
    withHarness(harness => {
      const { root, group, textureA } = buildScene();

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // Resize: bumps only the texture version — no node revision, the
      // fragment stays clean. The recorded UV words are normalized against
      // the record-time size (WebGl2SpriteRenderer._packInstance), so a
      // replay would sample a stale region: only the backend's collect-time
      // validation can catch this (the WebGPU parity guard).
      textureA.setSize(128, 128);

      measureFrame(harness, root); // must fall back to entry replay + re-record

      expect(replaySpy).not.toHaveBeenCalled(); // no stale batch replayed
      expect(beginSpy).toHaveBeenCalledTimes(1); // re-recorded the SAME frame
      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      // Steady state: the fresh recording (packed against 128x128) replays.
      const spliced = measureFrame(harness, root);

      expect(replaySpy).toHaveBeenCalledTimes(1);
      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(spliced.instances).toBe(4);

      root.destroy();
    });
  });

  it('nested retained groups: the outer set replays the whole spine; a nested group move stays replay-only (S3-D6)', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const root = new Container();
      const outer = new RetainedContainer();
      const inner = new RetainedContainer();
      const outerSprite = new Sprite(texture!);
      const innerSprite = new Sprite(texture!);

      outerSprite.setPosition(20, 20);
      innerSprite.setPosition(5, 5);
      inner.setPosition(100, 100);
      outer.setPosition(200, 200);
      outer.addChild(outerSprite);
      inner.addChild(innerSprite);
      outer.addChild(inner);
      root.addChild(outer);

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record (outer records; batches split at the inner boundary)

      const f3 = measureFrame(harness, root); // F3 splice

      // Two batches: outer's own draw + the inner group's draw, split by the
      // Enter/LeaveGroup flush boundary.
      expect(f3.drawCalls).toBe(2);
      expect(f3.instances).toBe(2);
      expect(f3.visibleNodes).toBe(2);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // A nested group move is decoupled from the outer content revision: the
      // outer set keeps splicing, the inner matrix is composed live from the
      // EnterGroup marker's node reference.
      const moved = measureFrame(harness, root, () => inner.setPosition(120, 90));

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(2);
      expect(moved.instances).toBe(2);
      expect(moved.uploadedBufferBytes).toBe(0); // fully retained scene: zero instance traffic

      root.destroy();
    });
  });

  it('device restore bumps the bundle generation: the set stops validating, re-records, then splices again', () => {
    withHarness(harness => {
      const { root, group } = buildScene();

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      const set = fragmentOf(group).instructions!;

      expect(set.isValidFor(harness.backend)).toBe(true);

      (harness.backend as unknown as { _onContextRestored(): void })._onContextRestored();

      expect(set.isValidFor(harness.backend)).toBe(false);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // Recovery frame: entry replay + re-record against the restored device.
      const recovery = measureFrame(harness, root);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(replaySpy).not.toHaveBeenCalled();
      expect(recovery.instances).toBe(4);

      // And the fast tier resumes.
      measureFrame(harness, root);

      expect(replaySpy).toHaveBeenCalledTimes(1);

      root.destroy();
    });
  });

  it('destroying the group releases the bundle and frees its accounted GPU memory (S3-D9)', () => {
    withHarness(harness => {
      const { root, group } = buildScene();

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice (binds + books the group transform texture)

      const before = harness.backend.stats.gpuMemoryBytes;

      expect(before).toBeGreaterThan(0);

      group.destroy();

      // The bundle's instance buffer (108 B) and transform texture (>= 3x16
      // rgba32f rows) are gone from the tally.
      expect(harness.backend.stats.gpuMemoryBytes).toBeLessThan(before - 100);

      root.destroy();
    });
  });

  it('a pixel-snapped draw inside an open capture validates normally: snapping is resolved in-shader, not on the CPU (S3-D5.3 belt-and-braces)', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const backend = harness.backend;
      const snapped = new Sprite(texture!);

      snapped.pixelSnapMode = PixelSnapMode.Geometry;

      const set = new RetainedInstructionSet();

      set.beginRecording(backend);
      backend._beginRetainedCapture(set);
      backend.draw(snapped);
      backend.flush();
      backend._endRetainedCapture(set);
      set.commitRecording();

      // Both pixel-snap modes are resolved in the vertex shaders from the
      // transform row flag, so the uploaded rows/quads stay view-independent
      // — a snapped draw is fully recordable, no poison instruction needed.
      expect(set.hasRecording).toBe(true);
      expect(set.isValidFor(backend)).toBe(true);

      snapped.destroy();
    });
  });
});

describe('WebGL2 retained instruction set: Slice 4b fast transform-row patch', () => {
  it('a transform-only direct-child move patches the row in place: replay continues, NO re-record, only the moved row uploads', () => {
    withHarness(harness => {
      const { root, group, inside } = buildScene();

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(harness.backend, '_replayRetainedBatch');

      // A pure transform move: content/structure stay clean (the flip), so the
      // group keeps its recording and patches just this child's row.
      inside[1]!.setPosition(80, 80);

      const patched = measureFrame(harness, root);

      expect(beginSpy).not.toHaveBeenCalled(); // NO re-record: the recording survives
      expect(replaySpy).toHaveBeenCalledTimes(1); // still splicing the instruction set
      expect(patched.instances).toBe(4);
      expect(patched.uploadedBufferBytes).toBe(32); // only the live outside sprite — group instance bytes untouched
      expect(patched.transformUploads).toBeGreaterThan(0); // the moved row uploaded

      // The patched group-local row (inside[1] -> local row 1) carries the new
      // position; its neighbours are untouched (O(k) sub-range, not a re-pack).
      const rows = bundleOf(group).transformTexture!.buffer;

      expect([rows[1 * 12 + 4], rows[1 * 12 + 5]]).toEqual([80, 80]);
      expect(rows[0 * 12 + 4]).toBe(10); // inside[0] unchanged
      expect(rows[2 * 12 + 4]).toBe(110); // inside[2] unchanged

      // And the fast tier keeps splicing on the next frame with no re-record.
      const steady = measureFrame(harness, root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(2);
      expect(steady.instances).toBe(4);

      root.destroy();
    });
  });

  it('after a transform-only child move, group.getBounds() reflects the new world AABB (4a bounds re-wiring)', () => {
    withHarness(harness => {
      const { root, group, inside } = buildScene();

      measureFrame(harness, root); // F1
      measureFrame(harness, root); // F2
      measureFrame(harness, root); // F3

      const before = group.getBounds();
      const beforeMaxX = before.x + before.width;

      // Move a child far to the +x/+y: the group's world AABB must grow to cover
      // it even though the move never content-dirtied the fragment.
      inside[2]!.setPosition(900, 900);
      measureFrame(harness, root);

      const after = group.getBounds();

      expect(after.x + after.width).toBeGreaterThan(beforeMaxX);
      // group at (200,200) + child local (900,900) -> world corner ~1100.
      expect(after.x + after.width).toBeGreaterThanOrEqual(1100);

      root.destroy();
    });
  });

  it('an INELIGIBLE move (nested below a plain sub-container) drops off the fast tier and re-records — never a bare patch', () => {
    withHarness(harness => {
      const [textureA] = makeTextures(1);
      const root = new Container();
      const outside = new Sprite(textureA!);
      const group = new RetainedContainer();
      const inner = new Container();
      const nested = new Sprite(textureA!);

      outside.setPosition(600, 300);
      root.addChild(outside);
      nested.setPosition(10, 10);
      inner.addChild(nested);
      group.addChild(inner);
      group.setPosition(200, 200);
      root.addChild(group);

      measureFrame(harness, root); // F1 capture
      measureFrame(harness, root); // F2 record
      measureFrame(harness, root); // F3 splice

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');

      // The nested sprite is NOT a direct child of the group, so its row is not
      // in the direct-draw map: the fast patch bails and drops the recording,
      // which entry-replays live transforms and re-records the same frame.
      nested.setPosition(90, 90);
      measureFrame(harness, root);

      expect(beginSpy).toHaveBeenCalledTimes(1); // re-recorded, not bare-patched

      root.destroy();
    });
  });
});
