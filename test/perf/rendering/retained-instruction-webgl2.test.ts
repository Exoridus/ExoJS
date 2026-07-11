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

const bundleOf = (group: RetainedContainer): WebGl2RetainedGroupResources =>
  fragmentOf(group).instructions!.ownedBundle as WebGl2RetainedGroupResources;

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
      expect(f4.uploadedBufferBytes).toBe(36); // ONLY the live outside sprite
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

      // 3 instances of 9 words each; word 8 is the node index. The outside
      // sprite occupied shared row 0, so the group's rows started at 1+ —
      // after the rebase they MUST read 0..2.
      expect(bundle.usedWords).toBe(3 * 9);
      expect([words[0 * 9 + 8], words[1 * 9 + 8], words[2 * 9 + 8]]).toEqual([0, 1, 2]);

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
      expect(moved.uploadedBufferBytes).toBe(36); // still only the live outside sprite

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

      // Mutation: the dirty frame is a plain collect — no replay, no capture.
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

  it('a pixel-snapped draw inside an open capture poisons the recording: the set never validates (S3-D5.3 belt-and-braces)', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const backend = harness.backend;
      const snapped = new Sprite(texture!);

      snapped.pixelSnapMode = 'geometry';

      const set = new RetainedInstructionSet();

      set.beginRecording(backend);
      backend._beginRetainedCapture(set);
      backend.draw(snapped);
      backend.flush();
      backend._endRetainedCapture(set);
      set.commitRecording();

      // The batch WAS appended (the draw is real), but the poison instruction
      // keeps the set from ever validating -> permanent entry-replay fallback.
      expect(set.hasRecording).toBe(true);
      expect(set.isValidFor(backend)).toBe(false);

      snapped.destroy();
    });
  });
});
