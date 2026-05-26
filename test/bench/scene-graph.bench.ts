import { bench, describe } from 'vitest';

import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';

const makeDrawable = (x = 0, y = 0, size = 16): Drawable => {
  const d = new Drawable();
  d.getLocalBounds().set(0, 0, size, size);
  d.setPosition(x, y);
  return d;
};

describe('scene-graph', () => {
  bench('deep-tree transform invalidation (11k nodes)', () => {
    const root = new Container();

    for (let a = 0; a < 10; a++) {
      const lvl1 = new Container();
      root.addChild(lvl1);
      for (let b = 0; b < 10; b++) {
        const lvl2 = new Container();
        lvl1.addChild(lvl2);
        for (let c = 0; c < 10; c++) {
          const lvl3 = new Container();
          lvl2.addChild(lvl3);
          for (let d = 0; d < 10; d++) {
            lvl3.addChild(makeDrawable(d * 20, c * 20));
          }
        }
      }
    }

    for (let i = 0; i < 100; i++) {
      root.setPosition(i % 100, i % 100);
    }

    root.destroy();
  });

  bench('bounds cache reads (1k nodes, 100 getBounds calls)', () => {
    const root = new Container();
    const nodes: Drawable[] = [];

    for (let i = 0; i < 1000; i++) {
      const d = makeDrawable((i % 50) * 20, Math.floor(i / 50) * 20);
      root.addChild(d);
      nodes.push(d);
    }

    for (let i = 0; i < 100; i++) {
      if (i % 10 === 0) root.setPosition(i % 50, 0);
      for (let j = 0; j < 100; j++) {
        nodes[(i * 97 + j * 31) % nodes.length].getBounds();
      }
    }

    root.destroy();
  });

  bench('addChild/removeChild churn (1k nodes, 50 swaps/frame × 100 frames)', () => {
    const parentA = new Container();
    const parentB = new Container();

    for (let i = 0; i < 1000; i++) {
      const d = makeDrawable(i * 5, 0);
      parentA.addChild(d);
    }

    for (let frame = 0; frame < 100; frame++) {
      const src = frame % 2 === 0 ? parentA : parentB;
      const dest = frame % 2 === 0 ? parentB : parentA;
      const srcChildren = src.children;
      const count = Math.min(50, srcChildren.length);
      const toMove: Drawable[] = [];

      for (let i = 0; i < count; i++) {
        toMove.push(srcChildren[i] as Drawable);
      }
      for (const child of toMove) {
        dest.addChild(child);
      }
    }

    parentA.destroy();
    parentB.destroy();
  });

  bench('zIndex-churn (1k children)', () => {
    const root = new Container();

    for (let i = 0; i < 1000; i++) {
      const d = makeDrawable(i * 2, 0);
      d.zIndex = Math.floor(Math.random() * 1000);
      root.addChild(d);
    }

    for (const child of root.children) {
      child.zIndex = Math.floor(Math.random() * 1000);
    }

    root.destroy();
  });
});
