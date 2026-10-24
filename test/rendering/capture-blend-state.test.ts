import { RenderEntryKind } from '#rendering/plan/renderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { createRenderBackendDouble } from '../support/render-backend-double';

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
