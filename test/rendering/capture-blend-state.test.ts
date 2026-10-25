import * as materialKeys from '#rendering/material/MaterialKey';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { RenderEntryKind } from '#rendering/plan/renderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { Shader } from '#rendering/shader/Shader';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { createRenderBackendDouble } from '../support/render-backend-double';

test.each([false, true])('warmed captures reuse material keys with own material %s', ownMaterial => {
  const texture = new Texture(document.createElement('canvas'));
  const node = new Sprite(texture);
  const target = new RenderTexture(64, 64);
  const backend = createRenderBackendDouble({ renderTarget: target });
  const builder = new RenderPlanBuilder();
  const material = ownMaterial ? new SpriteMaterial({ shader: new Shader({ glsl: { vertex: 'v', fragment: 'f' } }) }) : null;

  node.material = material;
  node.blendMode = BlendModes.Multiply;

  const captureKey = () => {
    const barrier = builder.build(node, backend).passes[0]!.root.entries[0]!;

    if (barrier.kind !== RenderEntryKind.Barrier) {
      throw new Error('expected capture barrier');
    }

    const draw = barrier.scope.childPlan!.entries[0]!;

    if (draw.kind !== RenderEntryKind.Draw) {
      throw new Error('expected captured draw');
    }

    return draw.command.material;
  };

  try {
    const ordinaryKey = node._getOrComputeMaterialKey(backend);
    const capture = captureKey();
    const pipelineKey = capture.pipelineKey;
    const resolve = vi.spyOn(node, '_getOrComputeMaterialKey');
    const write = vi.spyOn(materialKeys, 'writeMaterialKeyInto');
    const derive = vi.spyOn(materialKeys, 'derivePipelineKey');
    const deriveCapture = vi.spyOn(materialKeys, 'deriveCapturePipelineKey');

    for (let frame = 0; frame < 3; frame++) {
      expect(captureKey()).toBe(capture);
      expect(capture.pipelineKey).toBe(pipelineKey);
      expect(capture.blendMode).toBe(BlendModes.Normal);
    }

    expect(resolve).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenCalledTimes(ownMaterial ? 3 : 0);
    expect(derive).toHaveBeenCalledTimes(ownMaterial ? 3 : 0);
    expect(deriveCapture).not.toHaveBeenCalled();
    expect(ordinaryKey.blendMode).toBe(BlendModes.Multiply);

    if (material !== null) {
      material.blendMode = BlendModes.Additive;
      expect(captureKey()).toBe(capture);
      expect(capture.pipelineKey).not.toBe(pipelineKey);
      const updatedPipelineKey = capture.pipelineKey;

      expect(captureKey().pipelineKey).toBe(updatedPipelineKey);
      expect(deriveCapture).toHaveBeenCalledTimes(1);
    }
  } finally {
    vi.restoreAllMocks();
    node.destroy();
    texture.destroy();
    target.destroy();
  }
});

class FailingCapture extends Sprite {
  public override _collectForRenderPlan(builder: RenderPlanBuilder): void {
    super._collectForRenderPlan(builder);

    throw new Error('capture failed');
  }
}

test('a failed capture does not change the caller or the following draw blend', () => {
  const texture = new Texture(document.createElement('canvas'));
  const node = new FailingCapture(texture);
  const next = new Sprite(texture);
  const target = new RenderTexture(64, 64);
  const backend = createRenderBackendDouble({ renderTarget: target });
  const builder = new RenderPlanBuilder();

  node.blendMode = BlendModes.Multiply;
  next.blendMode = BlendModes.Additive;

  try {
    expect(() => builder.build(node, backend)).toThrow('capture failed');
    expect(node.blendMode).toBe(BlendModes.Multiply);
    const entry = builder.build(next, backend).passes[0]!.root.entries[0]!;

    expect(entry.kind).toBe(RenderEntryKind.Draw);

    if (entry.kind === RenderEntryKind.Draw) {
      expect(entry.command.material.blendMode).toBe(BlendModes.Additive);
    }
  } finally {
    node.destroy();
    next.destroy();
    texture.destroy();
    target.destroy();
  }
});
