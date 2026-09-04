/**
 * Min-heap of `(key, node)` pairs over two parallel typed arrays.
 *
 * Ties on `key` are broken by the lower node id, which is what makes a search
 * reproducible: equal-f nodes come off the open list in the same order on every
 * platform and every run, so two identical queries return the identical path
 * rather than an arbitrary member of the optimal set.
 *
 * The heap grows by doubling and never shrinks, so a pathfinder that has run
 * once at a given problem size does not allocate here again.
 *
 * @internal
 */
export class BinaryHeap {
  private nodes: Int32Array;
  private keys: Float64Array;
  private count = 0;

  public constructor(capacity = 64) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }

  public get size(): number {
    return this.count;
  }

  public clear(): void {
    this.count = 0;
  }

  public push(node: number, key: number): void {
    if (this.count === this.nodes.length) this.grow();

    let index = this.count++;

    this.nodes[index] = node;
    this.keys[index] = key;

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (!this.less(index, parent)) break;

      this.swap(index, parent);
      index = parent;
    }
  }

  /** Removes and returns the minimum node. The heap must not be empty. */
  public pop(): number {
    const top = this.nodes[0]!;
    const last = --this.count;

    if (last > 0) {
      this.nodes[0] = this.nodes[last]!;
      this.keys[0] = this.keys[last]!;
      this.sink();
    }

    return top;
  }

  private less(a: number, b: number): boolean {
    const keyA = this.keys[a]!;
    const keyB = this.keys[b]!;

    if (keyA !== keyB) return keyA < keyB;

    return this.nodes[a]! < this.nodes[b]!;
  }

  private swap(a: number, b: number): void {
    const node = this.nodes[a]!;
    const key = this.keys[a]!;

    this.nodes[a] = this.nodes[b]!;
    this.keys[a] = this.keys[b]!;
    this.nodes[b] = node;
    this.keys[b] = key;
  }

  private sink(): void {
    let index = 0;

    for (;;) {
      const left = index * 2 + 1;

      if (left >= this.count) break;

      const right = left + 1;
      const child = right < this.count && this.less(right, left) ? right : left;

      if (!this.less(child, index)) break;

      this.swap(index, child);
      index = child;
    }
  }

  private grow(): void {
    const nodes = new Int32Array(this.nodes.length * 2);
    const keys = new Float64Array(this.keys.length * 2);

    nodes.set(this.nodes);
    keys.set(this.keys);

    this.nodes = nodes;
    this.keys = keys;
  }
}
