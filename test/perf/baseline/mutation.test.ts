import { mutationSignature, selectMutationIndices } from './mutation';

/** Seed the harness pins for every cell (see `page/harness.ts`). */
const SEED = 0xc0ffee;

describe('selectMutationIndices', () => {
  test('is deterministic: identical inputs yield identical selections', () => {
    const a = selectMutationIndices(1_000, 0.075, SEED);
    const b = selectMutationIndices(1_000, 0.075, SEED);

    expect(a).toEqual(b);
  });

  test('draws one value per leaf in ascending index order (fraction 1 selects all, 0 selects none)', () => {
    expect(selectMutationIndices(5, 1, SEED)).toEqual([0, 1, 2, 3, 4]);
    expect(selectMutationIndices(1_000, 0, SEED)).toEqual([]);
  });

  test('returns indices in strictly ascending order within the node range', () => {
    const indices = selectMutationIndices(2_000, 0.1, SEED);

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
    }

    expect(indices[0]!).toBeGreaterThanOrEqual(0);
    expect(indices[indices.length - 1]!).toBeLessThan(2_000);
  });

  test('a different seed selects a different set (RNG actually drives selection)', () => {
    const a = selectMutationIndices(1_000, 0.075, SEED);
    const b = selectMutationIndices(1_000, 0.075, SEED + 1);

    expect(a).not.toEqual(b);
  });

  // Regression lock: the exact canonical selection for the real dynamic-heavy 1k
  // cell (mutationFraction 0.075). A change here means the shared RNG stream or
  // the selection algorithm moved — which would silently invalidate every
  // cross-session comparison — so it must be a deliberate, reviewed change.
  test('locks the canonical dynamic-heavy 1k selection', () => {
    const indices = selectMutationIndices(1_000, 0.075, SEED);

    expect(indices.length).toBe(66);
    expect(indices.slice(0, 10)).toEqual([0, 11, 25, 37, 58, 75, 92, 105, 107, 110]);
  });
});

describe('mutationSignature', () => {
  test('is deterministic and order-sensitive', () => {
    expect(mutationSignature([0, 1, 2])).toBe(mutationSignature([0, 1, 2]));
    expect(mutationSignature([0, 1])).not.toBe(mutationSignature([1, 0]));
  });

  test('folds length so an empty selection never collides with a single-element one', () => {
    expect(mutationSignature([])).not.toBe(mutationSignature([0]));
  });

  test('distinguishes selections that differ by a single index', () => {
    expect(mutationSignature([0, 1, 2])).not.toBe(mutationSignature([0, 1, 3]));
  });

  test('is 8 lowercase hex digits', () => {
    expect(mutationSignature([1, 2, 3])).toMatch(/^[0-9a-f]{8}$/);
  });

  // Regression lock for the canonical dynamic-heavy 1k signature: this is the
  // exact value the harness asserts each engine arm against (review B3). If it
  // changes, the cross-arm determinism guard's baseline moved.
  test('locks the canonical dynamic-heavy 1k signature', () => {
    expect(mutationSignature(selectMutationIndices(1_000, 0.075, SEED))).toBe('fa80f958');
  });
});
