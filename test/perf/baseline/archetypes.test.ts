import { createExoJsAdapter } from './adapters/exojs';
import { ARCHETYPES, buildMatrix, createRng, timedFramesFor } from './archetypes';
import type { Backend, EngineAdapter } from './EngineAdapter';

describe('createRng', () => {
  test('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  test('different seeds produce different streams', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  test('returns values in [0, 1)', () => {
    const rng = createRng(7);

    for (let i = 0; i < 100; i++) {
      const value = rng();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('timedFramesFor', () => {
  test('scales the timed-frame count down as node count grows', () => {
    expect(timedFramesFor(1_000)).toBe(120);
    expect(timedFramesFor(5_000)).toBe(90);
    expect(timedFramesFor(25_000)).toBe(60);
    expect(timedFramesFor(100_000)).toBe(30);
  });
});

describe('ARCHETYPES', () => {
  test('scaling archetypes sweep to 100k, gpu-bound archetypes cap at 25k', () => {
    const byId = Object.fromEntries(ARCHETYPES.map(a => [a.id, a]));

    expect(byId['static-heavy']!.nodeCounts).toEqual([1_000, 5_000, 25_000, 100_000]);
    expect(byId['dynamic-heavy']!.nodeCounts).toEqual([1_000, 5_000, 25_000, 100_000]);
    expect(byId['deep-hierarchy']!.nodeCounts).toEqual([1_000, 5_000, 25_000, 100_000]);
    expect(byId['overdraw']!.nodeCounts).toEqual([1_000, 5_000, 25_000]);
    expect(byId['batch-breaking']!.nodeCounts).toEqual([1_000, 5_000, 25_000]);
  });

  test('dynamic-heavy mutates a nonzero fraction, static-heavy mutates nothing', () => {
    const byId = Object.fromEntries(ARCHETYPES.map(a => [a.id, a]));

    expect(byId['static-heavy']!.mutationFraction).toBe(0);
    expect(byId['dynamic-heavy']!.mutationFraction).toBeGreaterThan(0);
  });
});

describe('buildMatrix', () => {
  const fakeAdapter = (engine: string, config: string, backends: Backend[]): EngineAdapter =>
    ({
      engine,
      config,
      supports: (b: Backend) => backends.includes(b),
      init: async () => undefined,
      buildScene: () => undefined,
      mutate: () => undefined,
      renderFrame: () => undefined,
      teardown: () => undefined,
    }) satisfies EngineAdapter;

  test('skips cells whose adapter does not support the backend', () => {
    const glOnly = fakeAdapter('exojs', 'current', ['webgl2']);
    const cells = buildMatrix([glOnly], ['webgl2', 'webgpu']);

    expect(cells.every(c => c.backend === 'webgl2')).toBe(true);
    expect(cells.length).toBeGreaterThan(0);
  });

  test('assigns each cell the timed-frame count for its node count', () => {
    const adapter = fakeAdapter('exojs', 'current', ['webgl2']);
    const cells = buildMatrix([adapter], ['webgl2']);
    const big = cells.find(c => c.nodeCount === 100_000)!;

    expect(big.timedFrames).toBe(timedFramesFor(100_000));
  });
});

describe('exojs adapter config axis', () => {
  test('the retained config produces an adapter labeled engine=exojs config=retained', () => {
    const adapter = createExoJsAdapter(undefined, 'retained');

    expect(adapter.engine).toBe('exojs');
    expect(adapter.config).toBe('retained');
  });

  test('the default stays current', () => {
    expect(createExoJsAdapter().config).toBe('current');
  });
});
