# Renderer performance benchmarks

Deterministic, GPU-free structural benchmarks + CPU-submission timing for the
ExoJS renderers (Sprite, NineSliceSprite, RepeatingSprite, tilemap chunks).

The harness runs the **real** WebGL2 backend and renderers in Node against a
recording fake WebGL2 context (`fakeWebGl2.ts`). The fake reflects attribute and
uniform names from the actual GLSL and records every structurally relevant GL
call (draw, bind, upload). Combined with the backend's own `RenderStats`, this
yields reproducible structural metrics **without a browser or GPU** — the real
batching, multi-texture-slot, flush, and upload code paths execute exactly as on
hardware (only shader execution and real-driver upload cost are absent).

## Why a fake context, not the plan layer?

Plan-level grouping (`pipelineKey:bindKey`) is **not** the same as GPU draw
calls: the sprite renderer merges up to 16 textures into one draw via per-instance
slots, and the "17th texture → flush" boundary lives inside the renderer. Only
running the real renderer reproduces that. The fake context measures the truth.

## Layout

| File                   | Role                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `fakeWebGl2.ts`        | Recording fake WebGL2 context + fake canvas/app + GLSL reflection.                  |
| `harness.ts`           | Wires the real backend + core renderers; drives a frame; snapshots `FrameMetrics`.  |
| `fixtures.ts`          | Sprite / nine-slice / repeating scene builders.                                     |
| `tilemapFixtures.ts`   | Tilemap scene builder + renderer wiring + rebuild counter access.                   |
| `scenarios.ts`         | The benchmark scenario catalog (the prompt's matrices).                             |
| `report.ts`            | JSON + CSV output writers.                                                          |
| `sweep.test.ts`        | Opt-in sweep (skipped unless `EXOJS_PERF_PROFILE`); writes machine-readable output. |
| `run-sweep.ts`         | Cross-platform launcher for the sweep.                                              |
| `structural-*.test.ts` | Tier-A deterministic regression assertions (run in normal CI).                      |

## Running

```bash
# Tier-A structural regression tests — deterministic, run in normal CI:
pnpm test                       # includes the rendering-perf project
npx vitest run --project=rendering-perf

# Opt-in benchmark sweep (writes .workspace/output/render-perf/{results.json,csv}):
pnpm perf:renderers:quick       # small matrix, ~5 s
pnpm perf:renderers             # full matrix, ~4 min

# Cross-validate structural metrics against a real GL context (Chromium):
pnpm perf:renderers:browser
```

## Metric tiers

- **Tier A — structural (deterministic, asserted in CI):** draw calls, batches,
  instances, visible/culled nodes, texture binds, buffer uploads, uploaded
  bytes, transform rows/uploads, geometry rebuilds. Identical across machines
  and across WebGL2/WebGPU (same plan grouping, instance formats, flush rules).
  Includes upload-coalescing gates: after RenderPlanPlayer's Phase 1 pre-pass,
  N cyclic-texture flushes produce at most 1 `texSubImage2D` instead of O(N).
- **Tier B — CPU submission timing (informational, never a CI gate):** median /
  p95 wall-clock of `render → flush` over many frames against the fake context.
  This is **CPU submission only** — it excludes GPU execution and real-driver
  upload cost. Absolute values are machine-specific; use deltas between commits.
- **Tier C — browser/GPU timing (opt-in):** real `requestAnimationFrame` /
  timer-query timing in the browser lanes. Not part of normal CI.

Wall-clock values are **never** Required-CI gates — one slower machine must not
fail CI. Only the deterministic Tier-A stats are asserted.

## Output

`pnpm perf:renderers[:quick]` writes to `.workspace/output/render-perf/`:

- `results.json` — full per-scenario records (metrics + timing + metadata).
- `results.csv` — flat structural + timing summary.
- `scenarios.csv` — the catalog axes (no measurements).

`.workspace/**` is gitignored; generated output is never committed.
