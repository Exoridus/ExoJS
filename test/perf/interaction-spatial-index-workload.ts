import type { Drawable } from '#rendering/Drawable';
import type { RetainedContainer } from '#rendering/RetainedContainer';

export const mutateSpatialIndexChurn = (
  nodes: readonly Drawable[],
  anchor: RetainedContainer,
  alternate: RetainedContainer,
  columns: number,
  frame: number,
): void => {
  const n = nodes.length;
  const count = Math.max(1, Math.floor(n / 1000));

  for (let i = 0; i < count; i++) {
    const id = ((((frame + 1) * 31 + i * 131) % n) + n) % n;
    const node = nodes[id]!;

    if (frame % 3 === 0) {
      const gridX = (id % columns) * 16;
      const offsetX = node.x === gridX ? 2 : 0;
      node.setPosition(gridX + offsetX, Math.floor(id / columns) * 16);
    } else if (frame % 3 === 1) {
      anchor.removeChild(node);
      anchor.addChild(node);
    } else {
      anchor.removeChild(node);
      alternate.addChild(node);
      alternate.removeChild(node);
      anchor.addChild(node);
    }
  }
};
