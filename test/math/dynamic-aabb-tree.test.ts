import type { AabbLike } from '#math/DynamicAabbTree';
import { DynamicAabbTree } from '#math/DynamicAabbTree';
import { Random } from '#math/Random';

describe('DynamicAabbTree', () => {
  describe('insert() / query()', () => {
    test('finds an inserted leaf via a point query inside its bounds', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(0, 0, 10, 10, 'a');

      const hits: string[] = [];
      tree.queryPoint(5, 5, payload => hits.push(payload));

      expect(hits).toEqual(['a']);
    });

    test('an empty tree (n=0) returns no query hits and has height 0', () => {
      const tree = new DynamicAabbTree<string>();
      const hits: string[] = [];

      tree.queryPoint(0, 0, payload => hits.push(payload));

      expect(hits).toEqual([]);
      expect(tree.height).toBe(0);
      expect(tree.leafCount).toBe(0);
      tree._validate();
    });

    test('a single-leaf tree (n=1) is a valid degenerate root', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(0, 0, 10, 10, 'only');

      tree._validate();
      expect(tree.leafCount).toBe(1);

      const hits: string[] = [];
      tree.query(-100, -100, 100, 100, payload => hits.push(payload));
      expect(hits).toEqual(['only']);
    });

    test('does not match a query AABB that does not overlap the leaf', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(0, 0, 10, 10, 'a');

      const hits: string[] = [];
      tree.query(50, 50, 60, 60, payload => hits.push(payload));

      expect(hits).toEqual([]);
    });

    test('a query overlapping two of three leaves finds exactly those two', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(0, 0, 10, 10, 'a');
      tree.insert(5, 5, 15, 15, 'b');
      tree.insert(100, 100, 110, 110, 'c');

      const hits: string[] = [];
      tree.query(0, 0, 15, 15, payload => hits.push(payload));

      expect(hits.sort()).toEqual(['a', 'b']);
    });
  });

  describe('update()', () => {
    test('returns false and leaves the fat AABB unchanged while the tight AABB still fits inside it', () => {
      const tree = new DynamicAabbTree<string>(5); // 5-unit margin
      const proxy = tree.insert(0, 0, 10, 10, 'a');

      const moved = tree.update(proxy, 1, 1, 11, 11); // shifted by 1, well inside the margin

      expect(moved).toBe(false);

      const out: AabbLike = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      tree.fatAabbOf(proxy, out);
      expect(out).toEqual({ minX: -5, minY: -5, maxX: 15, maxY: 15 });
    });

    test('returns true and recomputes the fat AABB once the tight AABB escapes the margin', () => {
      const tree = new DynamicAabbTree<string>(5);
      const proxy = tree.insert(0, 0, 10, 10, 'a');

      const moved = tree.update(proxy, 20, 20, 30, 30); // far outside the old fat AABB

      expect(moved).toBe(true);

      const out: AabbLike = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      tree.fatAabbOf(proxy, out);
      expect(out).toEqual({ minX: 15, minY: 15, maxX: 35, maxY: 35 });
      tree._validate();
    });

    test('applies the margin on both axes and never produces an invalid AABB for a zero-size input', () => {
      const tree = new DynamicAabbTree<string>(2);
      const proxy = tree.insert(5, 5, 5, 5, 'point'); // degenerate zero-size AABB

      const out: AabbLike = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      tree.fatAabbOf(proxy, out);

      expect(out.minX).toBeLessThan(out.maxX);
      expect(out.minY).toBeLessThan(out.maxY);
      expect(out).toEqual({ minX: 3, minY: 3, maxX: 7, maxY: 7 });
    });

    test('a payload survives update() unchanged', () => {
      const tree = new DynamicAabbTree<{ tag: string }>();
      const payload = { tag: 'x' };
      const proxy = tree.insert(0, 0, 10, 10, payload);

      tree.update(proxy, 50, 50, 60, 60);

      expect(tree.payloadOf(proxy)).toBe(payload);
    });
  });

  describe('remove()', () => {
    test('removing the only leaf empties the tree', () => {
      const tree = new DynamicAabbTree<string>();
      const proxy = tree.insert(0, 0, 10, 10, 'a');

      tree.remove(proxy);

      expect(tree.leafCount).toBe(0);
      expect(tree.height).toBe(0);
      tree._validate();
    });

    test('removing a leaf drops it from subsequent queries but keeps its siblings', () => {
      const tree = new DynamicAabbTree<string>();
      const a = tree.insert(0, 0, 10, 10, 'a');
      tree.insert(0, 0, 10, 10, 'b');

      tree.remove(a);

      const hits: string[] = [];
      tree.query(-100, -100, 100, 100, payload => hits.push(payload));

      expect(hits).toEqual(['b']);
      tree._validate();
    });
  });

  describe('fatOverlaps()', () => {
    test('reports true for overlapping fat AABBs and false otherwise', () => {
      const tree = new DynamicAabbTree<string>(1);
      const a = tree.insert(0, 0, 10, 10, 'a');
      const b = tree.insert(5, 5, 15, 15, 'b');
      const c = tree.insert(100, 100, 110, 110, 'c');

      expect(tree.fatOverlaps(a, b)).toBe(true);
      expect(tree.fatOverlaps(a, c)).toBe(false);
    });
  });

  describe('clear() / destroy()', () => {
    test('clear() empties the tree but keeps pool capacity for reuse', () => {
      const tree = new DynamicAabbTree<string>();

      for (let i = 0; i < 50; i++) {
        tree.insert(i, i, i + 1, i + 1, `item-${i}`);
      }

      tree.clear();

      expect(tree.leafCount).toBe(0);
      expect(tree.height).toBe(0);

      tree.insert(0, 0, 10, 10, 'reused');
      const hits: string[] = [];
      tree.query(-1, -1, 11, 11, payload => hits.push(payload));

      expect(hits).toEqual(['reused']);
      tree._validate();
    });

    test('destroy() releases all state', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(0, 0, 10, 10, 'a');

      tree.destroy();

      expect(tree.leafCount).toBe(0);
      expect(tree.height).toBe(0);
    });
  });

  describe('_walkBounds()', () => {
    test('visits every node exactly once, including internal nodes and leaves', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(0, 0, 10, 10, 'a');
      tree.insert(20, 20, 30, 30, 'b');
      tree.insert(40, 40, 50, 50, 'c');

      let leafCount = 0;
      let internalCount = 0;

      tree._walkBounds((_minX, _minY, _maxX, _maxY, isLeaf) => {
        if (isLeaf) {
          leafCount++;
        } else {
          internalCount++;
        }
      });

      expect(leafCount).toBe(3);
      expect(internalCount).toBe(2); // a binary tree over 3 leaves has 2 internal nodes
    });
  });

  describe('pool reuse under churn', () => {
    test('does not grow the node pool across repeated add/remove cycles', () => {
      const tree = new DynamicAabbTree<number>(1);

      const fillDrain = (): void => {
        const proxies: number[] = [];

        for (let i = 0; i < 100; i++) {
          proxies.push(tree.insert(i, i, i + 5, i + 5, i));
        }

        for (const proxy of proxies) {
          tree.remove(proxy);
        }
      };

      fillDrain(); // warm up to steady-state pool size

      // White-box pool-size read: `_nodes` is private, but this test exercises
      // exactly the free-list/pool the class's own `_validate()`/`_walkBounds()`
      // @internal hooks already grant test-only introspection into.
      const baseline = (tree as unknown as { _nodes: unknown[] })._nodes.length;

      for (let cycle = 0; cycle < 10; cycle++) {
        fillDrain();
      }

      const afterChurn = (tree as unknown as { _nodes: unknown[] })._nodes.length;

      expect(afterChurn).toBe(baseline);
      tree._validate();
    });
  });

  describe('randomized property test against a brute-force oracle', () => {
    test('insert/update/remove sequences always find every brute-force-tight-overlapping id, with valid invariants throughout', () => {
      const rng = new Random(20260714);
      const tree = new DynamicAabbTree<number>(2);
      const live = new Map<number, { proxy: number; minX: number; minY: number; maxX: number; maxY: number }>();
      let nextId = 0;

      const randomBox = (): { minX: number; minY: number; maxX: number; maxY: number } => {
        const x = rng.next(0, 200);
        const y = rng.next(0, 200);
        const w = rng.next(1, 20);
        const h = rng.next(1, 20);

        return { minX: x, minY: y, maxX: x + w, maxY: y + h };
      };

      const bruteForceQuery = (qMinX: number, qMinY: number, qMaxX: number, qMaxY: number): Set<number> => {
        const out = new Set<number>();

        for (const [id, box] of live) {
          if (box.maxX >= qMinX && box.minX <= qMaxX && box.maxY >= qMinY && box.minY <= qMaxY) {
            out.add(id);
          }
        }

        return out;
      };

      for (let op = 0; op < 2000; op++) {
        const roll = rng.next();

        if (roll < 0.5 || live.size === 0) {
          const box = randomBox();
          const id = nextId++;
          const proxy = tree.insert(box.minX, box.minY, box.maxX, box.maxY, id);
          live.set(id, { proxy, ...box });
        } else if (roll < 0.8) {
          const ids = [...live.keys()];
          const id = ids[Math.floor(rng.next(0, ids.length))]!;
          const entry = live.get(id)!;
          const box = randomBox();
          tree.update(entry.proxy, box.minX, box.minY, box.maxX, box.maxY);
          live.set(id, { ...entry, ...box });
        } else {
          const ids = [...live.keys()];
          const id = ids[Math.floor(rng.next(0, ids.length))]!;
          const entry = live.get(id)!;
          tree.remove(entry.proxy);
          live.delete(id);
        }

        if (op % 25 === 0) {
          tree._validate();

          const q = randomBox();
          const expected = bruteForceQuery(q.minX, q.minY, q.maxX, q.maxY);
          const actual = new Set<number>();

          // Query hits are over FAT AABBs (a superset of the tight ones tracked
          // here in `live`) — assert zero false negatives, not exact equality.
          tree.query(q.minX, q.minY, q.maxX, q.maxY, payload => actual.add(payload));

          for (const id of expected) {
            expect(actual.has(id)).toBe(true);
          }
        }
      }

      tree._validate();
    });
  });
});
