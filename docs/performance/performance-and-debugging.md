# Performance and Debugging

ExoJS includes practical runtime counters and a repeatable benchmark harness.

## Render Stats

Every frame, `Application` resets and updates `app.renderManager.stats`:

- `frame`
- `submittedNodes`
- `culledNodes`
- `drawCalls`
- `batches`
- `renderPasses`
- `renderTargetChanges`
- `frameTimeMs`

Example:

```ts
const stats = app.renderManager.stats;
console.log(`drawCalls=${stats.drawCalls} culled=${stats.culledNodes} frame=${stats.frameTimeMs.toFixed(2)}ms`);
```

## Culling

Scene nodes are cullable by default. Offscreen nodes are skipped.

Opt out when needed:

```ts
node.setCullable(false);
```

## Sorting Work

`sortableChildren` only re-sorts when dirty (`zIndex` changes or child structure changes).

Use it where deterministic ordering matters, avoid enabling it on containers that do not need z-sorting.

## Benchmark Harness

A baseline CPU-side benchmark exists at:

- `test/perf/rendering-benchmark.ts`

Run it with:

```bash
npm run perf:benchmark
```

Use this to compare broad traversal/culling behavior across changes.

## Practical Debug Loop

- monitor `drawCalls`, `batches`, and `culledNodes`
- verify expensive static subtrees use `cacheAsBitmap`
- verify offscreen-heavy scenes show rising `culledNodes`
- validate changes with the benchmark script before and after
