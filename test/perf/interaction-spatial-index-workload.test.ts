import { Drawable } from '#rendering/Drawable';
import { RetainedContainer } from '#rendering/RetainedContainer';

import { createInteractionHarness } from './interaction-harness';
import { mutateSpatialIndexChurn } from './interaction-spatial-index-workload';

describe('interaction spatial-index churn workload', () => {
  test.each([
    [100, 26],
    [2000, 52],
  ])('moves every selected local-edit node across repeated passes with %s nodes', (count, expectedMoves) => {
    const anchor = new RetainedContainer();
    const alternate = new RetainedContainer();
    const columns = Math.ceil(Math.sqrt(count));
    const nodes = Array.from({ length: count }, (_, id) => {
      const node = new Drawable();
      node.setPosition((id % columns) * 16, Math.floor(id / columns) * 16);
      anchor.addChild(node);

      return node;
    });
    let changedPositions = 0;

    try {
      for (let pass = 0; pass < 2; pass++) {
        for (let frame = 0; frame < 37; frame++) {
          const before = nodes.map(node => node.x);
          mutateSpatialIndexChurn(nodes, anchor, alternate, columns, frame);

          for (let id = 0; id < nodes.length; id++) {
            const change = Math.abs(nodes[id]!.x - before[id]!);

            if (change !== 0) {
              expect(change).toBe(2);
              changedPositions++;
            }
          }
        }
      }

      expect(changedPositions).toBe(expectedMoves);
      expect(anchor.children).toHaveLength(count);
      expect(alternate.children).toHaveLength(0);
    } finally {
      anchor.destroy();
      alternate.destroy();
    }
  });

  test.each([
    ['single', false, 111, 85],
    ['nested', true, 136, 120],
  ] as const)('%s retained groups update indexed hits after local movement and reparenting', (_label, nested, x, y) => {
    const harness = createInteractionHarness();
    const outer = new RetainedContainer().setPosition(100, 80);
    const anchor = nested ? new RetainedContainer().setPosition(25, 35) : outer;
    const alternate = new RetainedContainer().setPosition(700, 900);
    const node = new Drawable().setLocalBounds(0, 0, 10, 10);
    harness.scene.root.addChild(outer);
    harness.scene.root.addChild(alternate);

    if (nested) {
      outer.addChild(anchor);
    }

    anchor.addChild(node);
    node.interactive = true;

    try {
      harness.firePointer('pointerover', { clientX: x, clientY: y });
      harness.flush();
      expect(harness.interaction.getHoveredNode(1)).toBeNull();

      for (const frame of [0, 1, 2]) {
        mutateSpatialIndexChurn([node], anchor, alternate, 1, frame);
        harness.flush();
        harness.firePointer('pointermove', { clientX: x, clientY: y });
        harness.flush();
        expect(harness.interaction.getHoveredNode(1)).toBe(node);
      }

      mutateSpatialIndexChurn([node], anchor, alternate, 1, 3);
      harness.flush();
      harness.firePointer('pointermove', { clientX: x, clientY: y });
      harness.flush();
      expect(harness.interaction.getHoveredNode(1)).toBeNull();
    } finally {
      harness.destroy();
      outer.destroy();
      alternate.destroy();
    }
  });
});
