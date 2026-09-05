import { Session } from 'node:inspector';

import { describe, expect, it } from 'vitest';

import { Pathfinder } from '../src/Pathfinder';
import { GridSpace } from '../src/spaces/GridSpace';
import type { FindPathOptions } from '../src/types';
import { createRandom } from './helpers';

/**
 * Allocation gate for the search core.
 *
 * A query allocates its result - the node list and one point per node, which
 * the caller keeps - and that is deliberate. What it must not allocate is
 * anything that scales with the *search*: no per-expansion record, no per-node
 * closure, no buffer regrown after the pathfinder has already run at this
 * problem size.
 *
 * The gate is an absolute budget per path node on a grid whose searches expand
 * an order of magnitude more nodes than the path is long. One 32-byte object
 * per expanded node would therefore land several times over the budget, while
 * the result itself stays comfortably inside it.
 *
 * Measurement uses V8's allocation sampling profiler rather than a `heapUsed`
 * delta: these objects die immediately and are reclaimed inside the sampling
 * window, so a heap-size delta never sees them.
 */

const SIZE = 128;
const QUERIES = 200;
const WARMUP = 50;

/**
 * Bytes per path node the result itself is allowed to cost: one `Vector`, two
 * array slots, and the slack of the doubling both arrays grow by. Measured at
 * roughly half this on the reference machine; the headroom absorbs a different
 * V8 object layout, not a regression.
 */
const BUDGET_PER_NODE = 300;

// Istanbul rewrites every statement, which defeats escape analysis and inflates
// these numbers by orders of magnitude. The suite refuses to assert rather than
// report figures that describe instrumented code.
const INSTRUMENTED = /\bcov_[0-9a-z]+\b/u.test(String(Pathfinder.prototype.findPath));

const sumSelfSize = (node: import('node:inspector').HeapProfiler.SamplingHeapProfileNode): number =>
  node.selfSize + node.children.reduce((total, child) => total + sumSelfSize(child), 0);

const sampleBytes = async (body: () => void): Promise<number> => {
  const session = new Session();

  session.connect();

  const post = <T>(method: string, params?: Record<string, unknown>): Promise<T> =>
    new Promise((resolve, reject) => {
      session.post(method, params, (error: Error | null, result?: unknown) => {
        if (error) reject(error);
        else resolve(result as T);
      });
    });

  await post('HeapProfiler.enable');
  // Without these flags the profiler reports only what is still live when
  // sampling stops, which is none of the garbage this gate is about.
  await post('HeapProfiler.startSampling', {
    samplingInterval: 512,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });

  body();

  const { profile } = await post<{ profile: import('node:inspector').HeapProfiler.SamplingHeapProfile }>('HeapProfiler.stopSampling');

  await post('HeapProfiler.disable');
  session.disconnect();

  return sumSelfSize(profile.head);
};

const buildGrid = (): GridSpace => {
  const random = createRandom(0x9e3779b9);
  const blocked: boolean[] = [];

  for (let index = 0; index < SIZE * SIZE; index++) {
    blocked.push(random() < 0.25);
  }

  blocked[0] = false;
  blocked[SIZE * SIZE - 1] = false;

  return GridSpace.from(SIZE, SIZE, (x, y) => (blocked[y * SIZE + x] === true ? 0 : 1));
};

interface Measurement {
  bytesPerQuery: number;
  expandedNodes: number;
  pathLength: number;
}

const measure = async (options: FindPathOptions): Promise<Measurement> => {
  const grid = buildGrid();
  const pathfinder = new Pathfinder();
  const start = grid.nodeAt(0, 0);
  const goal = grid.nodeAt(SIZE - 1, SIZE - 1);

  let last = pathfinder.findPath(grid, start, goal, options);

  for (let index = 0; index < WARMUP; index++) {
    last = pathfinder.findPath(grid, start, goal, options);
  }

  expect(last.status).toBe('found');

  const totalBytes = await sampleBytes(() => {
    for (let index = 0; index < QUERIES; index++) {
      pathfinder.findPath(grid, start, goal, options);
    }
  });

  return { bytesPerQuery: totalBytes / QUERIES, expandedNodes: last.expandedNodes, pathLength: last.nodes.length };
};

describe('search allocation', () => {
  it.skipIf(INSTRUMENTED)('stays within the result budget while expanding far more nodes than it returns', async () => {
    const plain = await measure({ pruning: false });

    // Without this the budget below would prove nothing: it only bites because
    // the search visits many times more nodes than the path contains.
    expect(plain.expandedNodes).toBeGreaterThan(plain.pathLength * 10);
    expect(plain.bytesPerQuery).toBeLessThan(plain.pathLength * BUDGET_PER_NODE);
  });

  it.skipIf(INSTRUMENTED)('costs no more with jump-point pruning, which returns the same path', async () => {
    const pruned = await measure({});

    expect(pruned.expandedNodes).toBeGreaterThan(pruned.pathLength * 10);
    expect(pruned.bytesPerQuery).toBeLessThan(pruned.pathLength * BUDGET_PER_NODE);
  });

  it.skipIf(INSTRUMENTED)('does not keep growing its buffers across queries', async () => {
    const grid = buildGrid();
    const pathfinder = new Pathfinder();
    const start = grid.nodeAt(0, 0);
    const goal = grid.nodeAt(SIZE - 1, SIZE - 1);

    for (let index = 0; index < WARMUP; index++) {
      pathfinder.findPath(grid, start, goal);
    }

    const run = async (): Promise<number> =>
      sampleBytes(() => {
        for (let index = 0; index < QUERIES; index++) {
          pathfinder.findPath(grid, start, goal);
        }
      });

    const first = await run();
    const second = await run();

    // A buffer that regrew per query would make the later window the larger one.
    expect(second).toBeLessThan(first * 1.25);
  });
});
