const NULL_NODE = -1;

interface TreeNode<T> {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  parent: number;
  child1: number;
  child2: number;
  // -1 while the slot is free (pooled for reuse); 0 for a leaf; >=1 for an
  // internal node (1 + max(child heights)).
  height: number;
  payload: T | null;
}

/** Structural min/max AABB, compatible with exojs-physics' own `Aabb` interface. */
export interface AabbLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Boundless, incrementally-updated bounding-volume hierarchy over fat AABBs
 * (Box2D b2DynamicTree-style). Generic sibling of {@link Quadtree}: no world
 * bounds, no max depth; leaves persist across updates and are only reinserted
 * when their tight AABB escapes the stored fat AABB.
 *
 * Internals: an index-based node pool (a growable array of plain objects,
 * mirroring the reuse-by-index idiom used elsewhere in the engine) with a
 * free-list of freed slot indices for reuse. Insertion picks the sibling that
 * minimises the surface-area-heuristic (SAH) cost of the resulting subtree;
 * the ancestor chain is rebalanced on the way back to the root with AVL-style
 * rotations on the height-imbalance factor — both exactly as in Box2D's
 * `b2DynamicTree`. All public methods are allocation-free after the pool has
 * grown to its working-set size.
 *
 * @example
 * ```ts
 * const tree = new DynamicAabbTree<SceneNode>(4);
 * const proxy = tree.insert(0, 0, 10, 10, node);
 * tree.query(-5, -5, 5, 5, payload => console.log(payload));
 * ```
 */
export class DynamicAabbTree<T> {
  private readonly _margin: number;
  private readonly _nodes: TreeNode<T>[] = [];
  private readonly _freeIndices: number[] = [];
  private readonly _queryStack: number[] = [];
  private _root = NULL_NODE;
  private _leafCount = 0;

  /** `margin`: fat-AABB extension (world units) applied on insert/update. */
  public constructor(margin = 0) {
    this._margin = margin;
  }

  public get leafCount(): number {
    return this._leafCount;
  }

  public get height(): number {
    return this._root === NULL_NODE ? 0 : this._nodes[this._root]!.height;
  }

  /** Insert a leaf; returns its proxy id (stable until `remove`). */
  public insert(minX: number, minY: number, maxX: number, maxY: number, payload: T): number {
    const proxy = this._allocateNode();
    const node = this._nodes[proxy]!;
    const margin = this._margin;

    node.minX = minX - margin;
    node.minY = minY - margin;
    node.maxX = maxX + margin;
    node.maxY = maxY + margin;
    node.height = 0;
    node.child1 = NULL_NODE;
    node.child2 = NULL_NODE;
    node.payload = payload;

    this._insertLeaf(proxy);
    this._leafCount++;

    return proxy;
  }

  /**
   * Update a leaf's tight AABB. Returns `false` (and does nothing) while the
   * tight AABB still fits the stored fat AABB; returns `true` when the leaf
   * was removed and reinserted with a new fat AABB. The boolean is the sync
   * phase's "this leaf moved" signal.
   */
  public update(proxy: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
    const node = this._nodes[proxy]!;

    if (node.minX <= minX && node.minY <= minY && node.maxX >= maxX && node.maxY >= maxY) {
      return false;
    }

    const payload = node.payload;
    const margin = this._margin;

    this._removeLeaf(proxy);

    node.minX = minX - margin;
    node.minY = minY - margin;
    node.maxX = maxX + margin;
    node.maxY = maxY + margin;
    node.payload = payload;

    this._insertLeaf(proxy);

    return true;
  }

  public remove(proxy: number): void {
    this._removeLeaf(proxy);
    this._freeNode(proxy);
    this._leafCount--;
  }

  public payloadOf(proxy: number): T {
    // Only ever called by a consumer holding a proxy id it received from
    // `insert` and has not yet passed to `remove` — the slot is guaranteed live.
    return this._nodes[proxy]!.payload as T;
  }

  /** Copy the stored fat AABB into `out` (no allocation) and return it. */
  public fatAabbOf(proxy: number, out: AabbLike): AabbLike {
    const node = this._nodes[proxy]!;

    out.minX = node.minX;
    out.minY = node.minY;
    out.maxX = node.maxX;
    out.maxY = node.maxY;

    return out;
  }

  /** `true` when the two proxies' stored fat AABBs overlap (pair-maintenance re-check). */
  public fatOverlaps(proxyA: number, proxyB: number): boolean {
    const a = this._nodes[proxyA]!;
    const b = this._nodes[proxyB]!;

    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  }

  /**
   * Invoke `callback` for every leaf whose fat AABB overlaps the query AABB.
   * Allocation-free: traversal uses a persistent internal stack. Invocation
   * ORDER is tree-shape-dependent — callers needing determinism must
   * normalise their own output (physics does via its final id-sort).
   *
   * NOT re-entrant: because the traversal stack is a single persistent field
   * shared across all calls on this instance, a `callback` must not call
   * `query`/`queryPoint` again on the SAME tree instance. The nested call
   * resets the shared stack and silently truncates the outer traversal,
   * yielding an incomplete result set with no error thrown.
   */
  public query(minX: number, minY: number, maxX: number, maxY: number, callback: (payload: T, proxy: number) => void): void {
    if (this._root === NULL_NODE) {
      return;
    }

    const stack = this._queryStack;
    stack.length = 0;
    stack.push(this._root);

    while (stack.length > 0) {
      const index = stack.pop()!;
      const node = this._nodes[index]!;

      if (node.maxX < minX || node.minX > maxX || node.maxY < minY || node.minY > maxY) {
        continue;
      }

      if (node.height === 0) {
        callback(node.payload as T, index);
      } else {
        stack.push(node.child1);
        stack.push(node.child2);
      }
    }
  }

  /**
   * Point query; thin wrapper over `query` with a zero-extent AABB. Shares
   * `query`'s non-reentrancy caveat: do not call `query`/`queryPoint` on the
   * same tree instance from within a `query`/`queryPoint` callback.
   */
  public queryPoint(x: number, y: number, callback: (payload: T, proxy: number) => void): void {
    this.query(x, y, x, y, callback);
  }

  /** Remove all leaves, keep pool capacity (bulk reset). */
  public clear(): void {
    const nodes = this._nodes;

    // Free every still-live slot via `_freeNode`; already-free slots are left
    // untouched because they are already on `_freeIndices` exactly once. The
    // result is a fresh free-list holding every index once, with no duplicates
    // or stale entries.
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i]!.height !== -1) {
        this._freeNode(i);
      }
    }

    this._root = NULL_NODE;
    this._leafCount = 0;
  }

  /** Release pool + stacks entirely (mirrors Quadtree.destroy()). */
  public destroy(): void {
    this._nodes.length = 0;
    this._freeIndices.length = 0;
    this._queryStack.length = 0;
    this._root = NULL_NODE;
    this._leafCount = 0;
  }

  /**
   * Walk every node's fat AABB (debug/visualisation hook, mirrors
   * `Quadtree._walkBounds`). @internal
   */
  public _walkBounds(callback: (minX: number, minY: number, maxX: number, maxY: number, isLeaf: boolean) => void): void {
    this._walk(this._root, callback);
  }

  /**
   * Assert structural invariants (parent/child consistency, child-AABB
   * containment, correct heights/balance, free-list integrity). Throws on
   * violation. Test hook. @internal
   */
  public _validate(): void {
    if (this._root !== NULL_NODE) {
      if (this._nodes[this._root]!.parent !== NULL_NODE) {
        throw new Error('DynamicAabbTree._validate: root has a parent.');
      }

      this._validateNode(this._root);
    }

    let freeCount = 0;

    for (const index of this._freeIndices) {
      if (this._nodes[index]!.height !== -1) {
        throw new Error(`DynamicAabbTree._validate: free-listed node ${index} is not marked free.`);
      }

      freeCount++;
    }

    let liveCount = 0;

    for (const node of this._nodes) {
      if (node.height !== -1) {
        liveCount++;
      }
    }

    if (freeCount + liveCount !== this._nodes.length) {
      throw new Error('DynamicAabbTree._validate: free-list/live-node accounting mismatch.');
    }
  }

  private _validateNode(index: number): void {
    const node = this._nodes[index]!;

    if (node.height === 0) {
      if (node.child1 !== NULL_NODE || node.child2 !== NULL_NODE) {
        throw new Error(`DynamicAabbTree._validate: leaf ${index} has children.`);
      }

      return;
    }

    const c1 = node.child1;
    const c2 = node.child2;

    if (c1 === NULL_NODE || c2 === NULL_NODE) {
      throw new Error(`DynamicAabbTree._validate: internal node ${index} missing a child.`);
    }

    const child1 = this._nodes[c1]!;
    const child2 = this._nodes[c2]!;

    if (child1.parent !== index || child2.parent !== index) {
      throw new Error(`DynamicAabbTree._validate: node ${index}'s children have inconsistent parent pointers.`);
    }

    if (node.minX > child1.minX || node.minY > child1.minY || node.maxX < child1.maxX || node.maxY < child1.maxY) {
      throw new Error(`DynamicAabbTree._validate: node ${index}'s AABB does not contain child1.`);
    }

    if (node.minX > child2.minX || node.minY > child2.minY || node.maxX < child2.maxX || node.maxY < child2.maxY) {
      throw new Error(`DynamicAabbTree._validate: node ${index}'s AABB does not contain child2.`);
    }

    const expectedHeight = 1 + Math.max(child1.height, child2.height);

    if (node.height !== expectedHeight) {
      throw new Error(`DynamicAabbTree._validate: node ${index} height ${node.height} !== expected ${expectedHeight}.`);
    }

    const balanceFactor = child2.height - child1.height;

    if (balanceFactor > 1 || balanceFactor < -1) {
      throw new Error(`DynamicAabbTree._validate: node ${index} is unbalanced (factor ${balanceFactor}).`);
    }

    this._validateNode(c1);
    this._validateNode(c2);
  }

  private _walk(index: number, callback: (minX: number, minY: number, maxX: number, maxY: number, isLeaf: boolean) => void): void {
    if (index === NULL_NODE) {
      return;
    }

    const node = this._nodes[index]!;

    callback(node.minX, node.minY, node.maxX, node.maxY, node.height === 0);

    if (node.height !== 0) {
      this._walk(node.child1, callback);
      this._walk(node.child2, callback);
    }
  }

  private _allocateNode(): number {
    const free = this._freeIndices;

    if (free.length > 0) {
      return free.pop()!;
    }

    const index = this._nodes.length;

    this._nodes.push({ minX: 0, minY: 0, maxX: 0, maxY: 0, parent: NULL_NODE, child1: NULL_NODE, child2: NULL_NODE, height: -1, payload: null });

    return index;
  }

  private _freeNode(index: number): void {
    const node = this._nodes[index]!;

    node.height = -1;
    node.payload = null;
    node.parent = NULL_NODE;
    node.child1 = NULL_NODE;
    node.child2 = NULL_NODE;
    this._freeIndices.push(index);
  }

  private _insertLeaf(leaf: number): void {
    if (this._root === NULL_NODE) {
      this._root = leaf;
      this._nodes[leaf]!.parent = NULL_NODE;

      return;
    }

    const leafNode = this._nodes[leaf]!;
    const sibling = this._findBestSibling(leaf);
    const oldParent = this._nodes[sibling]!.parent;
    const newParent = this._allocateNode();
    const newParentNode = this._nodes[newParent]!;

    newParentNode.parent = oldParent;
    newParentNode.child1 = sibling;
    newParentNode.child2 = leaf;

    if (oldParent !== NULL_NODE) {
      const oldParentNode = this._nodes[oldParent]!;

      if (oldParentNode.child1 === sibling) {
        oldParentNode.child1 = newParent;
      } else {
        oldParentNode.child2 = newParent;
      }
    } else {
      this._root = newParent;
    }

    this._nodes[sibling]!.parent = newParent;
    leafNode.parent = newParent;

    this._refitAncestors(newParent);
  }

  private _removeLeaf(leaf: number): void {
    if (leaf === this._root) {
      this._root = NULL_NODE;

      return;
    }

    const parent = this._nodes[leaf]!.parent;
    const parentNode = this._nodes[parent]!;
    const grandParent = parentNode.parent;
    const sibling = parentNode.child1 === leaf ? parentNode.child2 : parentNode.child1;

    if (grandParent === NULL_NODE) {
      this._root = sibling;
      this._nodes[sibling]!.parent = NULL_NODE;
      this._freeNode(parent);

      return;
    }

    const grandParentNode = this._nodes[grandParent]!;

    if (grandParentNode.child1 === parent) {
      grandParentNode.child1 = sibling;
    } else {
      grandParentNode.child2 = sibling;
    }

    this._nodes[sibling]!.parent = grandParent;
    this._freeNode(parent);
    this._refitAncestors(grandParent);
  }

  /**
   * Walk from `start` to the root. At each ancestor: recompute its AABB/height
   * from its (already-correct) children FIRST, then balance — in that order,
   * because `_balance` decides whether to rotate by reading the node's OWN
   * height, which must already reflect its current children before that read
   * happens (a freshly-created parent's height is not valid until this runs).
   */
  private _refitAncestors(start: number): void {
    let index = start;

    while (index !== NULL_NODE) {
      const node = this._nodes[index]!;
      const c1 = this._nodes[node.child1]!;
      const c2 = this._nodes[node.child2]!;

      node.height = 1 + Math.max(c1.height, c2.height);
      this._unionInto(node, c1, c2);

      index = this._balance(index);
      index = this._nodes[index]!.parent;
    }
  }

  private _balance(iA: number): number {
    const A = this._nodes[iA]!;

    if (A.height < 2) {
      return iA;
    }

    const iB = A.child1;
    const iC = A.child2;
    const B = this._nodes[iB]!;
    const C = this._nodes[iC]!;
    const balanceFactor = C.height - B.height;

    if (balanceFactor > 1) {
      return this._rotate(iA, iC, iB);
    }

    if (balanceFactor < -1) {
      return this._rotate(iA, iB, iC);
    }

    return iA;
  }

  /**
   * Rotates so `iHeavy` (a child of `iA`, taller than its sibling `iLight`)
   * takes `iA`'s place in the tree; `iA` becomes a child of `iHeavy`, paired
   * with whichever of `iHeavy`'s former children is shorter (the taller one
   * stays under `iHeavy`, keeping the subtree balanced). Fully fixes up both
   * `iA`'s and `iHeavy`'s AABB/height — the caller (`_refitAncestors`) never
   * revisits `iA` (it becomes a descendant) and never re-derives `iHeavy`'s
   * own values (it only reads `iHeavy`'s `.parent` next), so both must be
   * complete before this returns.
   */
  private _rotate(iA: number, iHeavy: number, iLight: number): number {
    const A = this._nodes[iA]!;
    const heavy = this._nodes[iHeavy]!;
    const iF = heavy.child1;
    const iG = heavy.child2;
    const F = this._nodes[iF]!;
    const G = this._nodes[iG]!;
    const light = this._nodes[iLight]!;

    heavy.child1 = iA;
    heavy.parent = A.parent;
    A.parent = iHeavy;

    if (heavy.parent !== NULL_NODE) {
      const parent = this._nodes[heavy.parent]!;

      if (parent.child1 === iA) {
        parent.child1 = iHeavy;
      } else {
        parent.child2 = iHeavy;
      }
    } else {
      this._root = iHeavy;
    }

    A.child1 = iLight;

    if (F.height > G.height) {
      heavy.child2 = iF;
      A.child2 = iG;
      G.parent = iA;
      this._unionInto(A, light, G);
      this._unionInto(heavy, A, F);
      A.height = 1 + Math.max(light.height, G.height);
      heavy.height = 1 + Math.max(A.height, F.height);
    } else {
      heavy.child2 = iG;
      A.child2 = iF;
      F.parent = iA;
      this._unionInto(A, light, F);
      this._unionInto(heavy, A, G);
      A.height = 1 + Math.max(light.height, F.height);
      heavy.height = 1 + Math.max(A.height, G.height);
    }

    return iHeavy;
  }

  /** Descend from the root choosing, at each internal node, the cheaper of its two children to insert `leaf` under (SAH). */
  private _findBestSibling(leaf: number): number {
    const leafNode = this._nodes[leaf]!;
    let index = this._root;

    while (this._nodes[index]!.height !== 0) {
      const node = this._nodes[index]!;
      const c1 = node.child1;
      const c2 = node.child2;
      const child1 = this._nodes[c1]!;
      const child2 = this._nodes[c2]!;

      const area = perimeter(node.minX, node.minY, node.maxX, node.maxY);
      const combinedArea = perimeter(
        Math.min(node.minX, leafNode.minX),
        Math.min(node.minY, leafNode.minY),
        Math.max(node.maxX, leafNode.maxX),
        Math.max(node.maxY, leafNode.maxY),
      );

      const cost = 2 * combinedArea;
      const inheritanceCost = 2 * (combinedArea - area);
      const cost1 = childInsertionCost(child1, leafNode, inheritanceCost);
      const cost2 = childInsertionCost(child2, leafNode, inheritanceCost);

      if (cost < cost1 && cost < cost2) {
        break;
      }

      index = cost1 < cost2 ? c1 : c2;
    }

    return index;
  }

  private _unionInto(target: TreeNode<T>, a: TreeNode<T>, b: TreeNode<T>): void {
    target.minX = Math.min(a.minX, b.minX);
    target.minY = Math.min(a.minY, b.minY);
    target.maxX = Math.max(a.maxX, b.maxX);
    target.maxY = Math.max(a.maxY, b.maxY);
  }
}

/** Half-perimeter (width + height) of an AABB — a cheap 2D surface-area-heuristic proxy. */
const perimeter = (minX: number, minY: number, maxX: number, maxY: number): number => maxX - minX + (maxY - minY);

/** SAH cost of inserting `leaf` under `child` (a candidate descent target during sibling search). */
const childInsertionCost = <T>(child: TreeNode<T>, leaf: TreeNode<T>, inheritanceCost: number): number => {
  const directArea = perimeter(
    Math.min(child.minX, leaf.minX),
    Math.min(child.minY, leaf.minY),
    Math.max(child.maxX, leaf.maxX),
    Math.max(child.maxY, leaf.maxY),
  );

  if (child.height === 0) {
    return directArea + inheritanceCost;
  }

  return directArea - perimeter(child.minX, child.minY, child.maxX, child.maxY) + inheritanceCost;
};
