# Performance API

ExoJS exposes practical runtime counters through `renderManager.stats`.

## RenderStats Fields

- `frame`
- `submittedNodes`
- `culledNodes`
- `drawCalls`
- `batches`
- `renderPasses`
- `renderTargetChanges`
- `frameTimeMs`

`Application` resets stats each frame via `renderManager.resetStats()`.

## Example

```ts
const stats = app.renderManager.stats;
console.log(stats.drawCalls, stats.batches, stats.culledNodes, stats.frameTimeMs);
```

## Benchmark Harness

A repeatable baseline benchmark exists at:

- `test/perf/rendering-benchmark.ts`

Run:

```bash
npm run perf:benchmark
```

Use this for before/after performance comparisons in renderer/runtime work.
