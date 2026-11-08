import { Drawable } from '#rendering/Drawable';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { BlendModes } from '#rendering/types';

class Leaf extends Drawable {
  public constructor() {
    super();
    this.setLocalBounds(0, 0, 10, 10);
  }
}

const refresh = (group: RetainedContainer, destinationOpaque: boolean): void => {
  const builder = { _destinationOpaque: () => destinationOpaque } as unknown as RenderPlanBuilder;

  (group as unknown as { _refreshBranchEscapes(b: RenderPlanBuilder): void })._refreshBranchEscapes(builder);
};

const build = (): RetainedContainer => {
  const group = new RetainedContainer();
  const child = new Leaf();

  child.blendMode = BlendModes.Multiply;
  child.setPosition(5, 0);
  group.addChild(child);
  group.setPosition(100, 0);

  return group;
};

describe('RetainedContainer escape flip on destination coverage change', () => {
  test('group bounds match a freshly built group after the destination stops being opaque and the group then moves', () => {
    const group = build();

    refresh(group, true);
    group.updateBounds();

    refresh(group, false);
    group.setPosition(200, 0);
    group.updateBounds();

    const reference = build();

    reference.setPosition(200, 0);
    refresh(reference, false);
    reference.updateBounds();

    const rect = (g: RetainedContainer): number[] => {
      const b = g.getBounds();

      return [b.x, b.y, b.width, b.height];
    };

    expect(rect(group)).toEqual(rect(reference));
  });
});
