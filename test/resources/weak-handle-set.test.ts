import { WeakHandleSet } from '#resources/WeakHandleSet';

/** Real major GC + a macrotask hop so reclaimed WeakRefs settle. Needs `--expose-gc`. */
const gc = (globalThis as { gc?: () => void }).gc;
async function forceGc(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    gc?.();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('WeakHandleSet', () => {
  test('is empty on construction with no seed handle', () => {
    const set = new WeakHandleSet();

    expect(set.isEmpty).toBe(true);
    expect(set.first()).toBeUndefined();
    expect([...set]).toEqual([]);
  });

  test('seeds with a handle and reports it as the first live member', () => {
    const a = { id: 'a' };
    const set = new WeakHandleSet(a);

    expect(set.isEmpty).toBe(false);
    expect(set.has(a)).toBe(true);
    expect(set.first()).toBe(a);
    expect([...set]).toEqual([a]);
  });

  test('preserves insertion order across add()', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const c = { id: 'c' };
    const set = new WeakHandleSet(a);

    set.add(b);
    set.add(c);

    expect([...set]).toEqual([a, b, c]);
    expect(set.first()).toBe(a); // representative is stable (first inserted)
  });

  test('add() dedups by identity (no duplicate members)', () => {
    const a = { id: 'a' };
    const set = new WeakHandleSet(a);

    set.add(a);
    set.add(a);

    expect([...set]).toEqual([a]);
  });

  test('has() is false for a never-added handle', () => {
    const set = new WeakHandleSet({ id: 'a' });

    expect(set.has({ id: 'b' })).toBe(false);
  });

  test('prune() keeps all still-live slots and reports remaining life', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const set = new WeakHandleSet(a);
    set.add(b);

    expect(set.prune()).toBe(true);
    expect([...set]).toEqual([a, b]);
  });

  // GC-dependent: proves the whole point of the class — a dropped handle is
  // reclaimable and prune() compacts it out. Runs only under `--expose-gc`
  // (`NODE_OPTIONS=--expose-gc`); the deterministic tests above are the CI guard.
  test.runIf(typeof gc === 'function')('prune() drops the slot of a GC-reclaimed handle', async () => {
    const survivor = { id: 'survivor' };
    const set = new WeakHandleSet(survivor);
    set.add({ id: 'ephemeral' }); // no strong reference kept — GC-eligible

    await forceGc();

    expect(set.prune()).toBe(true); // survivor remains
    expect([...set]).toEqual([survivor]);
  });

  test.runIf(typeof gc === 'function')('becomes empty once the last handle is reclaimed', async () => {
    const set = new WeakHandleSet({ id: 'only' }); // no strong reference kept

    await forceGc();

    expect(set.prune()).toBe(false);
    expect(set.isEmpty).toBe(true);
  });
});
