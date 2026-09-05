import { BinaryHeap } from './BinaryHeap';

/** Largest generation stamp before the counter has to wrap. */
const MAX_GENERATION = 0xffffffff;

/**
 * Reusable per-search bookkeeping: g-scores, parent links, the closed set, the
 * open list and the neighbour scratch buffers.
 *
 * Nothing is cleared between searches. A node's g-score, parent and closed flag
 * count only while its generation stamp matches the current one, so starting a
 * search is a single counter increment instead of an O(nodeCapacity) wipe. That
 * is what lets one pathfinder serve interleaved queries over several spaces of
 * different sizes without touching memory it does not visit.
 *
 * @internal
 */
export class SearchState {
  public gScore = new Float64Array(0);
  public parent = new Int32Array(0);
  public closed = new Uint8Array(0);
  public neighborNodes = new Int32Array(0);
  public neighborCosts = new Float64Array(0);
  public readonly heap = new BinaryHeap();

  private stamp = new Uint32Array(0);
  private generation = 0;

  /** Grows the buffers to fit a space, keeping the generation stamps valid. */
  public reserve(nodeCapacity: number, degree: number): void {
    if (nodeCapacity > this.gScore.length) {
      const stamp = new Uint32Array(nodeCapacity);

      stamp.set(this.stamp);

      this.gScore = new Float64Array(nodeCapacity);
      this.parent = new Int32Array(nodeCapacity);
      this.closed = new Uint8Array(nodeCapacity);
      this.stamp = stamp;
    }

    if (degree > this.neighborNodes.length) {
      this.neighborNodes = new Int32Array(degree);
      this.neighborCosts = new Float64Array(degree);
    }
  }

  public begin(): void {
    if (this.generation === MAX_GENERATION) {
      this.stamp.fill(0);
      this.generation = 0;
    }

    this.generation++;
    this.heap.clear();
  }

  /**
   * Brings a node into the current search, resetting it on first touch.
   * Returns `true` when the node was already part of this search.
   */
  public touch(node: number): boolean {
    if (this.stamp[node] === this.generation) return true;

    this.stamp[node] = this.generation;
    this.gScore[node] = Infinity;
    this.parent[node] = -1;
    this.closed[node] = 0;

    return false;
  }
}
