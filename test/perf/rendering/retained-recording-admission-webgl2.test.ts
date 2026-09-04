/**
 * Structural gates for the COLLECT-TIME admission predicate that decides
 * whether a retained group's fragment is recorded at all
 * (`isRetainedFragmentRecordable` ->
 * `RetainedBatchCapableRenderer._admitsRetainedRecording`).
 *
 * The predicate used to look only at the renderer's capability flag, so it
 * admitted draws whose renderer then had to POISON the open capture from inside
 * its draw path - a mesh without static geometry and a shader-path repeating
 * sprite both did. That combination is stable but wasteful: the group opens a
 * capture, records into it, poisons it, fails validation, and re-arms on the
 * next clean frame - every frame, forever, for a recording it can never replay.
 * The poison itself stays in place as the safety net its contract describes;
 * these cells pin that a healthy scene no longer reaches it.
 *
 * What these pin, per draw class:
 * - array-vertex and non-`static` geometry meshes are NOT admitted: no capture
 *   opens, no poison instruction is appended, and the group keeps rendering off
 *   the (correct) entry-replay tier across mutation,
 * - a shared-`static`-geometry mesh IS still admitted and still records/replays,
 * - a shader-path repeating sprite is NOT admitted; a geometry-path one is,
 * - one non-admitted draw vetoes the WHOLE fragment (the predicate is all-or-
 *   nothing per group, which is what the poison used to achieve at draw time).
 */
import { describe, expect, it, vi } from 'vitest';

import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';

import { makeRegion, makeTextures } from './fixtures';
import { createWebGl2Harness, measureFrame, type WebGl2Harness } from './harness';

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

const withHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

const quadVertices = new Float32Array([0, 0, 16, 0, 16, 16, 0, 16]);
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
const quadUvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

/** Interleaved position+texcoord+color quad, in the layout the mesh renderer's default shader reads. */
const createQuadGeometry = (usage: 'static' | 'dynamic'): Geometry => {
  const stride = 20;
  const buffer = new ArrayBuffer(4 * stride);
  const view = new DataView(buffer);

  [
    [0, 0, 0, 0],
    [16, 0, 1, 0],
    [16, 16, 1, 1],
    [0, 16, 0, 1],
  ].forEach((vertex, index) => {
    const base = index * stride;

    view.setFloat32(base + 0, vertex[0]!, true);
    view.setFloat32(base + 4, vertex[1]!, true);
    view.setFloat32(base + 8, vertex[2]!, true);
    view.setFloat32(base + 12, vertex[3]!, true);
    view.setUint32(base + 16, 0xffffffff, true);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: buffer,
    stride,
    indices: quadIndices,
    usage,
  });
};

/**
 * A live sprite OUTSIDE (and before) the group, so the group is never the whole
 * frame and a vetoed group still has to interleave correctly with live work.
 */
const buildGroupScene = (texture: Texture, fill: (group: RetainedContainer) => void) => {
  const root = new Container();
  const outside = new Sprite(texture);
  const group = new RetainedContainer();

  outside.setPosition(600, 300);
  root.addChild(outside);

  fill(group);
  group.setPosition(100, 100);
  root.addChild(group);

  return { root, group };
};

/**
 * Drive four frames - capture, first clean frame (where recording is armed),
 * and two steady frames - and report what the retained machinery did.
 */
const runLadder = (harness: WebGl2Harness, root: Container) => {
  const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
  const poisonSpy = vi.spyOn(harness.backend, '_poisonRetainedCaptures');
  const replaySpy = vi.spyOn(harness.backend, 'replayRetainedBatch');
  const frames = [measureFrame(harness, root), measureFrame(harness, root), measureFrame(harness, root), measureFrame(harness, root)];

  return {
    frames,
    captures: beginSpy.mock.calls.length,
    poisons: poisonSpy.mock.calls.length,
    replays: replaySpy.mock.calls.length,
  };
};

describe('WebGL2 retained recording admission: draws their renderer would poison are never recorded', () => {
  it('does not admit an array-vertex mesh — no capture, no poison, stable entry replay', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const { root, group } = buildGroupScene(texture!, target => {
        for (let i = 0; i < 3; i++) {
          const mesh = new Mesh({ vertices: quadVertices, indices: quadIndices, uvs: quadUvs, texture: texture! });

          mesh.setPosition(i * 20, 0);
          target.addChild(mesh);
        }
      });

      const ladder = runLadder(harness, root);

      expect(fragmentOf(group).isRecordable(harness.backend)).toBe(false);
      expect(ladder.captures).toBe(0);
      expect(ladder.poisons).toBe(0);
      expect(ladder.replays).toBe(0);

      // Entry replay stays correct and steady: one draw call per array mesh
      // (they cannot batch) plus the live outside sprite, on every frame.
      for (const frame of ladder.frames) {
        expect(frame.drawCalls).toBe(4);
        expect(frame.visibleNodes).toBe(4);
      }

      root.destroy();
    });
  });

  it('does not admit a `dynamic`-usage geometry mesh', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const geometry = createQuadGeometry('dynamic');
      const { root, group } = buildGroupScene(texture!, target => {
        for (let i = 0; i < 2; i++) {
          const mesh = new Mesh({ geometry, texture: texture! });

          mesh.setPosition(i * 20, 0);
          target.addChild(mesh);
        }
      });

      const ladder = runLadder(harness, root);

      expect(fragmentOf(group).isRecordable(harness.backend)).toBe(false);
      expect(ladder.captures).toBe(0);
      expect(ladder.poisons).toBe(0);

      root.destroy();
      geometry.destroy();
    });
  });

  it('still admits a shared `static`-geometry mesh, which records and replays', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const geometry = createQuadGeometry('static');
      const { root, group } = buildGroupScene(texture!, target => {
        for (let i = 0; i < 2; i++) {
          const mesh = new Mesh({ geometry, texture: texture! });

          mesh.setPosition(i * 20, 0);
          target.addChild(mesh);
        }
      });

      const ladder = runLadder(harness, root);

      expect(fragmentOf(group).isRecordable(harness.backend)).toBe(true);
      expect(ladder.captures).toBe(1);
      expect(ladder.poisons).toBe(0);
      expect(ladder.replays).toBeGreaterThan(0);

      root.destroy();
      geometry.destroy();
    });
  });

  it('does not admit a shader-path repeating sprite, but does admit a geometry-path one', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const shaderScene = buildGroupScene(texture!, target => {
        // A bare Texture source resolves to the shader strategy.
        target.addChild(new RepeatingSprite(texture!, { width: 64, height: 64 }));
      });
      const shaderLadder = runLadder(harness, shaderScene.root);

      expect(fragmentOf(shaderScene.group).isRecordable(harness.backend)).toBe(false);
      expect(shaderLadder.captures).toBe(0);
      expect(shaderLadder.poisons).toBe(0);

      shaderScene.root.destroy();

      const region = makeRegion(texture!);
      const geometryScene = buildGroupScene(texture!, target => {
        target.addChild(new RepeatingSprite(region, { width: 64, height: 64 }));
      });
      const geometryLadder = runLadder(harness, geometryScene.root);

      expect(fragmentOf(geometryScene.group).isRecordable(harness.backend)).toBe(true);
      expect(geometryLadder.captures).toBe(1);
      expect(geometryLadder.poisons).toBe(0);

      geometryScene.root.destroy();
    });
  });

  it('vetoes the whole fragment when a single non-admitted draw sits among admitted ones', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const geometry = createQuadGeometry('static');
      const { root, group } = buildGroupScene(texture!, target => {
        target.addChild(new Sprite(texture!));
        target.addChild(new Mesh({ geometry, texture: texture! }));
        // The one array-vertex mesh takes the whole group off the recorded tier.
        target.addChild(new Mesh({ vertices: quadVertices, indices: quadIndices, uvs: quadUvs, texture: texture! }));
      });

      const ladder = runLadder(harness, root);

      expect(fragmentOf(group).isRecordable(harness.backend)).toBe(false);
      expect(ladder.captures).toBe(0);
      expect(ladder.poisons).toBe(0);

      root.destroy();
      geometry.destroy();
    });
  });

  it('keeps rendering an unrecorded array-mesh group correctly across mutation', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      let moved: Mesh | null = null;
      const { root } = buildGroupScene(texture!, target => {
        for (let i = 0; i < 3; i++) {
          const mesh = new Mesh({ vertices: quadVertices, indices: quadIndices, uvs: quadUvs, texture: texture! });

          mesh.setPosition(i * 20, 0);
          target.addChild(mesh);
          moved ??= mesh;
        }
      });

      measureFrame(harness, root);
      measureFrame(harness, root);

      const poisonSpy = vi.spyOn(harness.backend, '_poisonRetainedCaptures');

      moved!.setPosition(200, 200);

      const afterMove = measureFrame(harness, root);

      expect(afterMove.drawCalls).toBe(4);
      expect(afterMove.visibleNodes).toBe(4);
      expect(poisonSpy).not.toHaveBeenCalled();

      root.destroy();
    });
  });
});
