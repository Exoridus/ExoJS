import type { QuadtreeItem } from '#math/Quadtree';
import { Quadtree } from '#math/Quadtree';
import { Rectangle } from '#math/Rectangle';

function makeItem(x: number, y: number, width: number, height: number, payload = `${x},${y},${width},${height}`): QuadtreeItem<string> {
  return { bounds: new Rectangle(x, y, width, height), payload };
}

describe('Quadtree', () => {
  describe('insert()', () => {
    test('stores items directly while under capacity', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 8, 5);
      const item = makeItem(10, 10, 5, 5);

      tree.insert(item);

      const results = tree.queryPoint(12, 12);

      expect(results).toContain(item);
    });

    test('subdivides once maxItems is exceeded and routes items into a fully-containing child', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 2, 5);

      // Three overlapping items, all fully inside the NW quadrant [0,50)x[0,50):
      // inserting the third exceeds maxItems(2) and forces a subdivision.
      tree.insert(makeItem(1, 1, 4, 4, 'a'));
      tree.insert(makeItem(2, 2, 4, 4, 'b'));
      tree.insert(makeItem(3, 3, 4, 4, 'c'));

      // (3, 3) falls inside all three overlapping bounds.
      const results = tree.queryPoint(3, 3);

      expect(results.map(item => item.payload).sort()).toEqual(['a', 'b', 'c']);
    });

    test('an item spanning multiple quadrants is kept at the current node rather than duplicated', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);

      tree.insert(makeItem(10, 10, 2, 2, 'first'));
      // This item straddles the NW/NE quadrant boundary (x=50) and cannot be
      // fully contained by any single child.
      tree.insert(makeItem(45, 10, 20, 2, 'spanning'));

      const results = tree.queryRect(new Rectangle(0, 0, 100, 100));

      expect(results.map(item => item.payload).sort()).toEqual(['first', 'spanning']);
    });

    test('does not subdivide past maxDepth — items accumulate at the deepest node', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 0);

      tree.insert(makeItem(1, 1, 4, 4, 'a'));
      tree.insert(makeItem(2, 2, 4, 4, 'b'));
      tree.insert(makeItem(3, 3, 4, 4, 'c'));

      // maxDepth=0 means the root never subdivides (depth 0 is not < maxDepth 0).
      const results = tree.queryPoint(3, 3);

      expect(results.map(item => item.payload).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('queryPoint()', () => {
    test('returns an empty array when the point is outside the tree bounds', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

      expect(tree.queryPoint(-10, -10)).toEqual([]);
    });

    test('only returns items whose bounds actually contain the point', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));
      const inside = makeItem(0, 0, 10, 10, 'inside');
      const outside = makeItem(50, 50, 10, 10, 'outside');

      tree.insert(inside);
      tree.insert(outside);

      const results = tree.queryPoint(5, 5);

      expect(results).toContain(inside);
      expect(results).not.toContain(outside);
    });

    test('recurses into children and appends into a provided results buffer', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);

      tree.insert(makeItem(1, 1, 2, 2, 'a'));
      tree.insert(makeItem(2, 2, 2, 2, 'b'));

      const buffer: Array<QuadtreeItem<string>> = [];
      const returned = tree.queryPoint(2, 2, buffer);

      expect(returned).toBe(buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('queryRect()', () => {
    test('returns an empty array when the rect does not overlap the tree bounds', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

      expect(tree.queryRect(new Rectangle(500, 500, 10, 10))).toEqual([]);
    });

    test('only returns items whose bounds overlap the query rect', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));
      const overlapping = makeItem(5, 5, 10, 10, 'overlap');
      const disjoint = makeItem(90, 90, 5, 5, 'disjoint');

      tree.insert(overlapping);
      tree.insert(disjoint);

      const results = tree.queryRect(new Rectangle(0, 0, 20, 20));

      expect(results).toContain(overlapping);
      expect(results).not.toContain(disjoint);
    });

    test('recurses into children', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);

      tree.insert(makeItem(1, 1, 2, 2, 'a'));
      tree.insert(makeItem(60, 60, 2, 2, 'b'));

      const results = tree.queryRect(new Rectangle(0, 0, 100, 100));

      expect(results.map(item => item.payload).sort()).toEqual(['a', 'b']);
    });
  });

  describe('remove()', () => {
    test('removes an item found at the root and returns true', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));
      const item = makeItem(10, 10, 5, 5);

      tree.insert(item);

      expect(tree.remove(item)).toBe(true);
      expect(tree.queryPoint(12, 12)).toEqual([]);
    });

    test('removes an item found in a descendant and returns true', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);
      const a = makeItem(1, 1, 2, 2, 'a');
      const b = makeItem(2, 2, 2, 2, 'b');

      tree.insert(a);
      tree.insert(b); // triggers subdivision, both land in a child

      expect(tree.remove(b)).toBe(true);

      const results = tree.queryPoint(2, 2);

      expect(results).not.toContain(b);
      expect(results).toContain(a);
    });

    test('returns false when the item is not present anywhere in the tree', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);

      tree.insert(makeItem(1, 1, 2, 2, 'a'));
      tree.insert(makeItem(2, 2, 2, 2, 'b'));

      expect(tree.remove(makeItem(99, 99, 1, 1, 'ghost'))).toBe(false);
    });
  });

  describe('clear()', () => {
    test('removes all items and collapses child nodes', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);

      tree.insert(makeItem(1, 1, 2, 2, 'a'));
      tree.insert(makeItem(2, 2, 2, 2, 'b'));
      tree.insert(makeItem(60, 60, 2, 2, 'c'));

      tree.clear();

      expect(tree.queryRect(new Rectangle(0, 0, 100, 100))).toEqual([]);
    });

    test('is safe to call on an already-empty tree', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

      expect(() => tree.clear()).not.toThrow();
    });
  });

  describe('_walkBounds()', () => {
    test('visits the root and every subdivided child rectangle', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);

      tree.insert(makeItem(1, 1, 2, 2, 'a'));
      tree.insert(makeItem(2, 2, 2, 2, 'b')); // forces one subdivision

      const visited: Rectangle[] = [];

      tree._walkBounds(rect => visited.push(rect));

      // Root + 4 children.
      expect(visited.length).toBe(5);
      expect(visited[0]!.equals({ x: 0, y: 0, width: 100, height: 100 })).toBe(true);
    });

    test('visits only the root when the tree never subdivided', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));
      const visited: Rectangle[] = [];

      tree._walkBounds(rect => visited.push(rect));

      expect(visited).toHaveLength(1);
    });
  });

  describe('destroy()', () => {
    test('does not throw for a leaf tree', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100));

      tree.insert(makeItem(1, 1, 2, 2));

      expect(() => tree.destroy()).not.toThrow();
    });

    test('recursively destroys subdivided children', () => {
      const tree = new Quadtree<string>(new Rectangle(0, 0, 100, 100), 1, 5);

      tree.insert(makeItem(1, 1, 2, 2, 'a'));
      tree.insert(makeItem(2, 2, 2, 2, 'b')); // forces subdivision

      expect(() => tree.destroy()).not.toThrow();
    });
  });
});
