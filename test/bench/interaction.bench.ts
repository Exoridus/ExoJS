import { bench, describe } from 'vitest';

import type { QuadtreeItem } from '../../src/math/Quadtree';
import { Quadtree } from '../../src/math/Quadtree';
import { Rectangle } from '../../src/math/Rectangle';
import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import type { RenderNode } from '../../src/rendering/RenderNode';

const makeInteractiveDrawable = (x: number, y: number, size = 32): Drawable => {
  const d = new Drawable();
  d.getLocalBounds().set(0, 0, size, size);
  d.setPosition(x, y);
  d.interactive = true;
  return d;
};

const hitTestRecursive = (node: RenderNode, x: number, y: number): RenderNode | null => {
  if (!node.visible) return null;
  if (node instanceof Container) {
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = hitTestRecursive(children[i], x, y);
      if (hit) return hit;
    }
  }
  if (node.interactive && node.contains(x, y)) return node;
  return null;
};

interface IndexedNode { node: RenderNode; order: number; }

const hitTestIndexed = (qt: Quadtree<IndexedNode>, buf: QuadtreeItem<IndexedNode>[], x: number, y: number): RenderNode | null => {
  buf.length = 0;
  qt.queryPoint(x, y, buf);
  let bestOrder = -1;
  let bestNode: RenderNode | null = null;
  for (const candidate of buf) {
    const { node, order } = candidate.payload;
    if (order > bestOrder && node.contains(x, y)) { bestOrder = order; bestNode = node; }
  }
  return bestNode;
};

const buildIndex = (root: Container, worldBounds: Rectangle): Quadtree<IndexedNode> => {
  const qt = new Quadtree<IndexedNode>(new Rectangle(worldBounds.x, worldBounds.y, worldBounds.width, worldBounds.height));
  let order = 0;
  const collect = (node: RenderNode): void => {
    if (!node.visible) return;
    if (node.interactive) qt.insert({ bounds: node.getBounds(), payload: { node, order: order++ } });
    if (node instanceof Container) { for (const child of node.children) collect(child); }
  };
  collect(root);
  return qt;
};

const NODES = 1000;
const QUERIES = 100;
const FRAMES = 100;

describe('interaction', () => {
  bench('recursive hit-test (1k nodes, 100 queries/frame × 100 frames)', () => {
    const root = new Container();
    for (let i = 0; i < NODES; i++) {
      root.addChild(makeInteractiveDrawable((i % 40) * 25, Math.floor(i / 40) * 25));
    }

    for (let frame = 0; frame < FRAMES; frame++) {
      for (let q = 0; q < QUERIES; q++) {
        hitTestRecursive(root, (frame * 97 + q * 31) % 1000, (frame * 53 + q * 17) % 625);
      }
    }

    root.destroy();
  });

  bench('quadtree hit-test (1k nodes, index rebuilt each frame, 100 frames)', () => {
    const root = new Container();
    const buf: QuadtreeItem<IndexedNode>[] = [];
    const worldBounds = new Rectangle(0, 0, 1000, 625);

    for (let i = 0; i < NODES; i++) {
      root.addChild(makeInteractiveDrawable((i % 40) * 25, Math.floor(i / 40) * 25));
    }

    for (let frame = 0; frame < FRAMES; frame++) {
      const qt = buildIndex(root, worldBounds);
      for (let q = 0; q < QUERIES; q++) {
        hitTestIndexed(qt, buf, (frame * 97 + q * 31) % 1000, (frame * 53 + q * 17) % 625);
      }
      qt.destroy();
    }

    root.destroy();
    worldBounds.destroy();
  });

  bench('drag-move (50 position updates × 100 frames)', () => {
    const root = new Container();
    const dragNode = makeInteractiveDrawable(400, 300, 64);
    dragNode.draggable = true;
    root.addChild(dragNode);

    for (let frame = 0; frame < FRAMES; frame++) {
      for (let m = 0; m < 50; m++) {
        dragNode.position.x = 200 + Math.sin((frame * 50 + m) * 0.01) * 150 + 5;
        dragNode.position.y = 150 + Math.cos((frame * 50 + m) * 0.01) * 100 + 5;
      }
    }

    root.destroy();
  });
});
