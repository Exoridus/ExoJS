/**
 * W002-05: reproducible in-process Node benchmark of the REAL InputSystem /
 * InteractionSystem pipeline. Run explicitly via tsx; this performance
 * benchmark is deliberately not part of the normal unit test suite.
 *
 * "legacy" overrides only the anchored insert/remove and hit-test methods to
 * run the original Set + _beatsBest loop, on the SAME engine binary / runner.
 * Every workload otherwise uses the same real engine, synthetic platform
 * events, pointer state, and scene nodes. This is a Node benchmark, NOT a
 * claim about browser frame time or GPU performance.
 *
 * Index maintenance and hit-testing are timed separately. Total time is
 * their sum plus mutation work. Net heap deltas are GC-sensitive diagnostics,
 * NOT allocated byte counts.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import type { DynamicAabbTree } from '../../src/math/DynamicAabbTree';
import { Drawable } from '../../src/rendering/Drawable';
import type { RenderNode } from '../../src/rendering/RenderNode';
import { RetainedContainer } from '../../src/rendering/RetainedContainer';
import type { InteractionHarness } from './interaction-harness';
import { createInteractionHarness } from './interaction-harness';

type Variant = 'legacy' | 'group-tree';
type Layout = 'single' | 'nested';
type Workload = 'static' | 'moving' | 'churn';
type Mix = 'hit90' | 'miss90';

interface InternalInteraction {
  _tree: DynamicAabbTree<{ node: RenderNode }> | null;
  _anchoredIndex: {
    unindexed: Set<RenderNode>;
    insert(node: RenderNode): void;
    remove(node: RenderNode): void;
  };
  _hitTestIndexed(x: number, y: number): RenderNode | null;
  _beatsBest(candidate: RenderNode, best: RenderNode | null, x: number, y: number): boolean;
}

interface Summary {
  readonly n: number;
  readonly layout: Layout;
  readonly workload: Workload;
  readonly mix: Mix;
  readonly variant: Variant;
  readonly setupMs: number;
  readonly mutationMedianMs: number;
  readonly maintenanceMedianMs: number;
  readonly queryMedianMs: number;
  readonly queryP95Ms: number;
  readonly totalMedianMs: number;
  readonly totalP95Ms: number;
  readonly netHeapDeltaBytes: number;
  readonly signature: number;
}

/** Minimal legacy implementation copied from the next-branch anchored path. */
const useLegacyAnchoredPath = (harness: InteractionHarness): void => {
  const im = harness.interaction as unknown as InternalInteraction;

  im._anchoredIndex.insert = (node): void => {
    im._anchoredIndex.unindexed.add(node);
  };

  im._anchoredIndex.remove = (node): void => {
    im._anchoredIndex.unindexed.delete(node);
  };

  im._hitTestIndexed = (x, y): RenderNode | null => {
    let best: RenderNode | null = null;

    im._tree?.queryPoint(x, y, indexed => {
      if (im._beatsBest(indexed.node, best, x, y)) {
        best = indexed.node;
      }
    });

    for (const node of im._anchoredIndex.unindexed) {
      if (im._beatsBest(node, best, x, y)) {
        best = node;
      }
    }

    return best;
  };
};

const quantile = (data: readonly number[], probability: number): number => {
  const sorted = [...data].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))]!;
};

const round = (n: number): number => Number(n.toFixed(4));

interface Fixture {
  readonly harness: InteractionHarness;
  readonly outer: RetainedContainer;
  readonly anchor: RetainedContainer;
  readonly alternate: RetainedContainer;
  readonly nodes: readonly Drawable[];
  readonly columns: number;
  readonly baseInnerX: number;
  readonly baseInnerY: number;
  readonly setupMs: number;
}

const createFixture = (n: number, layout: Layout, variant: Variant): Fixture => {
  const started = performance.now();
  const harness = createInteractionHarness({ width: 4096, height: 4096 });

  if (variant === 'legacy') {
    useLegacyAnchoredPath(harness);
  }

  const outer = new RetainedContainer();
  const anchor = layout === 'nested' ? new RetainedContainer() : outer;
  const alternate = new RetainedContainer();
  const baseInnerX = layout === 'nested' ? 25 : 0;
  const baseInnerY = layout === 'nested' ? 35 : 0;

  outer.setPosition(100, 80);
  alternate.setPosition(700, 900);
  harness.scene.root.addChild(outer);
  harness.scene.root.addChild(alternate);

  if (anchor !== outer) {
    anchor.setPosition(baseInnerX, baseInnerY);
    outer.addChild(anchor);
  }

  const nodes: Drawable[] = [];
  const columns = Math.ceil(Math.sqrt(n));

  for (let i = 0; i < n; i++) {
    const drawable = new Drawable();
    drawable.name = `spatial-${i}`;
    drawable.setLocalBounds(0, 0, 10, 10);
    drawable.setPosition((i % columns) * 16, Math.floor(i / columns) * 16);
    anchor.addChild(drawable);
    drawable.interactive = true;
    nodes.push(drawable);
  }

  harness.firePointer('pointerover', { clientX: 0, clientY: 0 });
  harness.flush();

  return {
    harness,
    outer,
    anchor,
    alternate,
    nodes,
    columns,
    baseInnerX,
    baseInnerY,
    setupMs: performance.now() - started,
  };
};

const runCase = (n: number, layout: Layout, workload: Workload, variant: Variant): readonly Summary[] => {
  const fixture = createFixture(n, layout, variant);
  const { harness, outer, anchor, alternate, nodes, columns, setupMs, baseInnerX, baseInnerY } = fixture;
  const mixes: readonly Mix[] = ['hit90', 'miss90'];
  const summaries: Summary[] = [];
  const queryCount = 20;
  const warmup = 5;
  const measured = n >= 10_000 ? 24 : 32;

  try {
    for (const mix of mixes) {
      const mutationMs: number[] = [];
      const maintenanceMs: number[] = [];
      const queryMs: number[] = [];
      const totalMs: number[] = [];
      let signature = 2166136261;
      const heapStart = process.memoryUsage().heapUsed;

      for (let frame = -warmup; frame < measured; frame++) {
        const start = performance.now();
        let outerX = 100;
        let outerY = 80;
        let innerX = baseInnerX;
        let innerY = baseInnerY;

        if (workload === 'moving') {
          outerX += (frame + warmup + 1) % 11;
          outerY += ((frame + warmup + 1) * 3) % 13;
          outer.setPosition(outerX, outerY);

          if (anchor !== outer) {
            innerX += ((frame + warmup + 1) * 5) % 9;
            innerY += ((frame + warmup + 1) * 7) % 9;
            anchor.setPosition(innerX, innerY);
          }
        } else if (workload === 'churn') {
          const count = Math.max(1, Math.floor(n / 1000));

          for (let i = 0; i < count; i++) {
            const id = (((frame + warmup + 1) * 31 + i * 131) % n + n) % n;
            const node = nodes[id]!;

            if ((frame + warmup) % 3 === 0) {
              node.setPosition((id % columns) * 16 + ((frame + warmup) % 3), Math.floor(id / columns) * 16);
            } else if ((frame + warmup) % 3 === 1) {
              anchor.removeChild(node);
              anchor.addChild(node);
            } else {
              anchor.removeChild(node);
              alternate.addChild(node);
              alternate.removeChild(node);
              anchor.addChild(node);
            }
          }
        }

        const afterMutation = performance.now();
        harness.flush();
        const afterMaintenance = performance.now();

        for (let q = 0; q < queryCount; q++) {
          const idx = (((frame + warmup + 1) * 97 + q * 23) % n + n) % n;
          const hit = q % 10 < (mix === 'hit90' ? 9 : 1);
          const x = hit ? outerX + innerX + (idx % columns) * 16 + 5 : 3500 + (q % 7) * 2;
          const y = hit ? outerY + innerY + Math.floor(idx / columns) * 16 + 5 : 3500 + (q % 11) * 2;

          harness.firePointer('pointermove', { clientX: x, clientY: y });
          harness.flush();

          if (frame >= 0) {
            const node = harness.interaction.getHoveredNode(1);
            const token = node?.name ?? 'none';

            for (let k = 0; k < token.length; k++) {
              signature = Math.imul(signature ^ token.charCodeAt(k), 16777619) >>> 0;
            }
          }
        }

        const finished = performance.now();

        if (frame >= 0) {
          mutationMs.push(afterMutation - start);
          maintenanceMs.push(afterMaintenance - afterMutation);
          queryMs.push(finished - afterMaintenance);
          totalMs.push(finished - start);
        }
      }

      const heapEnd = process.memoryUsage().heapUsed;

      summaries.push({
        n,
        layout,
        workload,
        mix,
        variant,
        setupMs: round(setupMs),
        mutationMedianMs: round(quantile(mutationMs, 0.5)),
        maintenanceMedianMs: round(quantile(maintenanceMs, 0.5)),
        queryMedianMs: round(quantile(queryMs, 0.5)),
        queryP95Ms: round(quantile(queryMs, 0.95)),
        totalMedianMs: round(quantile(totalMs, 0.5)),
        totalP95Ms: round(quantile(totalMs, 0.95)),
        netHeapDeltaBytes: heapEnd - heapStart,
        signature,
      });
    }
  } finally {
    harness.destroy();
    harness.scene.root.destroy();
  }

  return summaries;
};

const runBenchmark = (): void => {
  const counts = [100, 1000, 10_000];
  const layouts: Layout[] = ['single', 'nested'];
  const workloads: Workload[] = ['static', 'moving', 'churn'];
  const output: Summary[] = [];

  for (const n of counts) {
    for (const layout of layouts) {
      for (const workload of workloads) {
        const legacy = runCase(n, layout, workload, 'legacy');
        const indexed = runCase(n, layout, workload, 'group-tree');

        for (let i = 0; i < legacy.length; i++) {
          const left = legacy[i]!;
          const right = indexed[i]!;
          assert.equal(
            right.signature,
            left.signature,
            `hit parity: n=${n}, layout=${layout}, workload=${workload}, mix=${right.mix}`,
          );
          output.push(left, right);
        }
      }
    }
  }

  const comparisons = [];

  for (let i = 0; i < output.length; i += 2) {
    const base = output[i]!;
    const index = output[i + 1]!;
    const speedup = base.totalMedianMs / index.totalMedianMs;

    comparisons.push({
      n: base.n,
      layout: base.layout,
      workload: base.workload,
      mix: base.mix,
      baselineMedianMs: base.totalMedianMs,
      baselineP95Ms: base.totalP95Ms,
      indexedMedianMs: index.totalMedianMs,
      indexedP95Ms: index.totalP95Ms,
      speedup: round(speedup),
      baselineQueryMs: base.queryMedianMs,
      indexedQueryMs: index.queryMedianMs,
      baselineMutationMs: base.mutationMedianMs,
      indexedMutationMs: index.mutationMedianMs,
      baselineMaintenanceMs: base.maintenanceMedianMs,
      indexedMaintenanceMs: index.maintenanceMedianMs,
      baselineSetupMs: base.setupMs,
      indexedSetupMs: index.setupMs,
      baselineHeapDelta: base.netHeapDeltaBytes,
      indexedHeapDelta: index.netHeapDeltaBytes,
    });
  }

  // Deliberately no brittle time-based assertion. Test failure indicates a
  // correctness regression only; go/no-go is the reviewed TOTAL-path data.
  const benchmarkMeta = {
    platform: 'node',
    runtime: process.version,
    runner: process.platform,
    arch: process.arch,
    samples: '24@10k,32@100/1k',
    queriesPerSample: 20,
    heap: 'net delta, GC-sensitive, NOT allocations',
    browserMeasured: false,
  };

  console.log(`W00205_BENCHMARK_META=${JSON.stringify(benchmarkMeta)}`);
  console.log(`W00205_BENCHMARK_TABLE=${JSON.stringify(comparisons)}`);
};

runBenchmark();
