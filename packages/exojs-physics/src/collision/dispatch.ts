import type { ShapeType } from '../shapes/Shape';

/**
 * Canonical order of the shape kinds, roundest first. Two things depend on it
 * and nothing else should: a pair table stores each unordered pair once, under
 * the lower kind, and a mixed pair is always solved with the lower kind as the
 * first operand plus a flip flag that reverses the resulting normal. One
 * implementation per pair, never two mirrored copies.
 *
 * Inserting a kind changes only which slot a pair lands in, never which
 * implementation runs.
 */
export const shapeKindOrder: Readonly<Record<ShapeType, number>> = {
  circle: 0,
  capsule: 1,
  polygon: 2,
};

export const shapeKindCount = Object.keys(shapeKindOrder).length;

/**
 * Flat `kind × kind` table. Symmetric tables fill only the upper triangle and
 * are read through {@link symmetricEntry}; ordered ones (a sweep distinguishes
 * the moving operand from the target) fill both halves and are read directly
 * with {@link orderedEntry}.
 */
export type PairTable<T> = Array<T | undefined>;

const emptyTable = <T>(): PairTable<T> => {
  const table: PairTable<T> = [];

  for (let i = 0; i < shapeKindCount * shapeKindCount; i++) {
    table.push(undefined);
  }

  return table;
};

/** Build a table holding one entry per **unordered** pair. */
export const symmetricTable = <T>(entries: ReadonlyArray<readonly [ShapeType, ShapeType, T]>): PairTable<T> => {
  const table = emptyTable<T>();

  for (const [first, second, value] of entries) {
    const a = shapeKindOrder[first];
    const b = shapeKindOrder[second];

    table[Math.min(a, b) * shapeKindCount + Math.max(a, b)] = value;
  }

  return table;
};

/** Build a table holding one entry per **ordered** pair. */
export const orderedTable = <T>(entries: ReadonlyArray<readonly [ShapeType, ShapeType, T]>): PairTable<T> => {
  const table = emptyTable<T>();

  for (const [first, second, value] of entries) {
    table[shapeKindOrder[first] * shapeKindCount + shapeKindOrder[second]] = value;
  }

  return table;
};

/**
 * Entry for the unordered pair `(first, second)`. `undefined` means the pair is
 * deliberately unsupported - callers must treat that as "no contact", never as
 * an approximation.
 */
export const symmetricEntry = <T>(table: PairTable<T>, first: ShapeType, second: ShapeType): T | undefined => {
  const a = shapeKindOrder[first];
  const b = shapeKindOrder[second];

  return table[Math.min(a, b) * shapeKindCount + Math.max(a, b)];
};

/** `true` when the operands have to be swapped to reach the canonical order. */
export const needsFlip = (first: ShapeType, second: ShapeType): boolean => shapeKindOrder[first] > shapeKindOrder[second];

/** Entry for the ordered pair `(first, second)`; see {@link symmetricEntry} on `undefined`. */
export const orderedEntry = <T>(table: PairTable<T>, first: ShapeType, second: ShapeType): T | undefined =>
  table[shapeKindOrder[first] * shapeKindCount + shapeKindOrder[second]];
