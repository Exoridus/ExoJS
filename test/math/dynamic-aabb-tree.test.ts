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

  describe('rayCast()', () => {
    test('an empty tree yields no ray-cast hits', () => {
      const tree = new DynamicAabbTree<string>();
      const hits: string[] = [];

      tree.rayCast(0, 0, 1, 0, Infinity, payload => hits.push(payload));

      expect(hits).toEqual([]);
    });

    test('a ray crossing a leaf reports it; a ray missing it does not', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(10, -5, 20, 5, 'a');

      const hit: string[] = [];
      tree.rayCast(0, 0, 1, 0, Infinity, payload => hit.push(payload));
      expect(hit).toEqual(['a']);

      const miss: string[] = [];
      tree.rayCast(0, 100, 1, 0, Infinity, payload => miss.push(payload));
      expect(miss).toEqual([]);
    });

    test('a ray grazing a leaf edge (tangent) still counts as a candidate', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(10, 0, 20, 10, 'a'); // ray along y=0 grazes the box's bottom edge

      const hits: string[] = [];
      tree.rayCast(0, 0, 1, 0, Infinity, payload => hits.push(payload));

      expect(hits).toEqual(['a']);
    });

    test('maxDistance clamps the segment: a leaf past the end is not visited', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(100, -5, 110, 5, 'far');

      const near: string[] = [];
      tree.rayCast(0, 0, 1, 0, 50, payload => near.push(payload));
      expect(near).toEqual([]);

      const reached: string[] = [];
      tree.rayCast(0, 0, 1, 0, 200, payload => reached.push(payload));
      expect(reached).toEqual(['far']);
    });

    test('an axis-aligned ray with a zero direction component is handled by the slab test', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(-5, 40, 5, 50, 'up'); // straight up along +y from the origin
      tree.insert(40, -5, 50, 5, 'right'); // off the vertical ray

      const hits: string[] = [];
      tree.rayCast(0, 0, 0, 1, Infinity, payload => hits.push(payload));

      expect(hits).toEqual(['up']);
    });

    test('a ray behind the origin (leaf entirely at negative t) is not visited', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(-30, -5, -20, 5, 'behind');

      const hits: string[] = [];
      tree.rayCast(0, 0, 1, 0, Infinity, payload => hits.push(payload));

      expect(hits).toEqual([]);
    });

    test('a ray reports only the leaves it crosses, not the 40 in a distant off-ray cluster', () => {
      const tree = new DynamicAabbTree<number>(1);

      // Three leaves strung along the +x ray at y=0.
      tree.insert(10, -2, 12, 2, 0);
      tree.insert(30, -2, 32, 2, 1);
      tree.insert(50, -2, 52, 2, 2);

      // A dense cluster far off the ray line — the ray must reach none of them.
      for (let i = 0; i < 40; i++) {
        tree.insert(1000 + i, 1000, 1002 + i, 1002, 100 + i);
      }

      const visited: number[] = [];
      tree.rayCast(0, 0, 1, 0, Infinity, payload => visited.push(payload));

      // Exactly the three on-ray leaves; the callback fires far fewer than
      // leafCount times, so distant leaves are correctly excluded.
      expect(visited.sort((a, b) => a - b)).toEqual([0, 1, 2]);
      expect(tree.leafCount).toBe(43);
    });

    test('is decoupled from query(): a rayCast issued inside a query() callback does not truncate the outer traversal', () => {
      const tree = new DynamicAabbTree<string>();
      tree.insert(0, 0, 10, 10, 'a');
      tree.insert(2, 2, 12, 12, 'b');
      tree.insert(4, 4, 14, 14, 'c');

      const outer: string[] = [];
      const nested: string[] = [];

      tree.query(-100, -100, 100, 100, payload => {
        outer.push(payload);
        // Nested rayCast on the SAME instance — uses a separate stack, so it must
        // not corrupt the outer query's still-live traversal.
        tree.rayCast(-100, 5, 1, 0, Infinity, p => nested.push(p));
      });

      expect(outer.sort()).toEqual(['a', 'b', 'c']);
      expect(nested.length).toBeGreaterThan(0);
    });

    test('randomized: every leaf whose tight AABB the ray crosses is reported (zero false negatives)', () => {
      const rng = new Random(20260714);
      const tree = new DynamicAabbTree<number>(2);
      const live = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();

      for (let id = 0; id < 200; id++) {
        const x = rng.next(0, 300);
        const y = rng.next(0, 300);
        const w = rng.next(1, 25);
        const h = rng.next(1, 25);
        const box = { minX: x, minY: y, maxX: x + w, maxY: y + h };
        tree.insert(box.minX, box.minY, box.maxX, box.maxY, id);
        live.set(id, box);
      }

      for (let trial = 0; trial < 200; trial++) {
        const ox = rng.next(-50, 350);
        const oy = rng.next(-50, 350);
        const dirX = rng.next(-1, 1);
        const dirY = rng.next(-1, 1);
        const len = Math.hypot(dirX, dirY) || 1;
        const dx = dirX / len;
        const dy = dirY / len;
        const maxDistance = rng.next() < 0.5 ? Infinity : rng.next(10, 400);

        const expected = new Set<number>();

        for (const [id, box] of live) {
          if (raySegmentHitsBox(ox, oy, dx, dy, maxDistance, box.minX, box.minY, box.maxX, box.maxY)) {
            expected.add(id);
          }
        }

        const actual = new Set<number>();
        tree.rayCast(ox, oy, dx, dy, maxDistance, payload => actual.add(payload));

        // Hits are over FAT AABBs (a superset of the tight boxes tracked here) —
        // assert zero false negatives, not exact equality.
        for (const id of expected) {
          expect(actual.has(id)).toBe(true);
        }
      }
    });
  });
});

// Oracle for the tree's ray prune, deliberately using a DIFFERENT technique
// (orientation-based segment/edge crossing) than the tree's own slab test, so a
// shared conceptual flaw can't hide in both. Exact for a finite `maxDistance`;
// for `Infinity` the ray is clamped to a segment long enough to reach the whole
// test region — a farther box it would nonetheless cross is simply under-reported
// (weakening the check, never over-reporting), which keeps `expected ⊆ actual`
// sound: every box the oracle claims is one the ray truly enters.
const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

const onSegment = (ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean =>
  Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);

const segmentsIntersect = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number, p4x: number, p4y: number): boolean => {
  const o1 = orient(p1x, p1y, p2x, p2y, p3x, p3y);
  const o2 = orient(p1x, p1y, p2x, p2y, p4x, p4y);
  const o3 = orient(p3x, p3y, p4x, p4y, p1x, p1y);
  const o4 = orient(p3x, p3y, p4x, p4y, p2x, p2y);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  return (
    (o1 === 0 && onSegment(p1x, p1y, p2x, p2y, p3x, p3y)) ||
    (o2 === 0 && onSegment(p1x, p1y, p2x, p2y, p4x, p4y)) ||
    (o3 === 0 && onSegment(p3x, p3y, p4x, p4y, p1x, p1y)) ||
    (o4 === 0 && onSegment(p3x, p3y, p4x, p4y, p2x, p2y))
  );
};

const raySegmentHitsBox = (ox: number, oy: number, dx: number, dy: number, maxDistance: number, minX: number, minY: number, maxX: number, maxY: number): boolean => {
  const length = Number.isFinite(maxDistance) ? maxDistance : 4000; // covers the whole [-50,350] test region
  const ex = ox + dx * length;
  const ey = oy + dy * length;
  const inside = (px: number, py: number): boolean => px >= minX && px <= maxX && py >= minY && py <= maxY;

  if (inside(ox, oy) || inside(ex, ey)) {
    return true;
  }

  return (
    segmentsIntersect(ox, oy, ex, ey, minX, minY, maxX, minY) ||
    segmentsIntersect(ox, oy, ex, ey, maxX, minY, maxX, maxY) ||
    segmentsIntersect(ox, oy, ex, ey, maxX, maxY, minX, maxY) ||
    segmentsIntersect(ox, oy, ex, ey, minX, maxY, minX, minY)
  );
};
