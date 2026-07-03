/**
 * In-place heap sort — deterministic, O(n log n) regardless of input order, and
 * allocation-free. `Array.prototype.sort` allocates an internal temp buffer in
 * V8's TimSort for arrays larger than ~10 elements; the broad-phase and contact
 * sorts run over ~1,000 elements every step, so that temp buffer is per-step
 * garbage. Heap sort sorts in place with only a constant number of locals.
 *
 * Heap sort is not stable, but every physics comparator (`byMinX`, `byPairId`,
 * `byRecordPair`, `byColliderPair`, `bySensorPair`) breaks ties on collider id,
 * so no two elements ever compare equal — the ordering is total and therefore
 * bit-identical to the `Array.prototype.sort` it replaces (replay
 * determinism). Do not use this with a comparator that can return 0 for distinct
 * elements; the result order would then differ from a stable sort.
 *
 * @internal
 */
export function sortInPlace<T>(array: T[], compare: (a: T, b: T) => number): void {
  const n = array.length;

  // Heapify: turn the array into a max-heap bottom-up.
  for (let i = (n >> 1) - 1; i >= 0; i--) {
    siftDown(array, i, n, compare);
  }

  // Repeatedly move the max (root) to the sorted tail, then restore the heap.
  for (let end = n - 1; end > 0; end--) {
    const root = array[0]!;
    array[0] = array[end]!;
    array[end] = root;
    siftDown(array, 0, end, compare);
  }
}

function siftDown<T>(array: T[], start: number, end: number, compare: (a: T, b: T) => number): void {
  let parent = start;

  for (;;) {
    let child = parent * 2 + 1;

    if (child >= end) {
      break;
    }

    // Pick the larger of the two children.
    if (child + 1 < end && compare(array[child]!, array[child + 1]!) < 0) {
      child++;
    }

    // Parent already dominates the larger child — heap property restored.
    if (compare(array[parent]!, array[child]!) >= 0) {
      break;
    }

    const tmp = array[parent]!;
    array[parent] = array[child]!;
    array[child] = tmp;
    parent = child;
  }
}
