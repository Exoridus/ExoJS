import { afterEach, describe, expect, test, vi } from 'vitest';

import { raceWithTimeout } from '../src/shared/timeout';

describe('raceWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('disarms the hang guard when the cell rejects, and still propagates the rejection', async () => {
    vi.useFakeTimers();

    const run = raceWithTimeout(Promise.reject(new Error('determinism divergence')), 900_000, 'wedged');

    await expect(run).rejects.toThrow('determinism divergence');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('disarms the hang guard when the cell finishes', async () => {
    vi.useFakeTimers();

    await expect(raceWithTimeout(Promise.resolve('result'), 900_000, 'wedged')).resolves.toBe('result');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('resolves to the timeout sentinel when the cell outlives the guard', async () => {
    vi.useFakeTimers();

    const run = raceWithTimeout(new Promise<string>(() => {}), 1_000, 'wedged');

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(run).resolves.toBe('wedged');
  });
});
