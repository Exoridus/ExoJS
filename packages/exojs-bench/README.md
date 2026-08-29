# @codexo/exojs-bench

Private, reproducible cross-library rendering/physics benchmark harness for ExoJS.
Not published. Compares ExoJS against competitor libraries (Pixi, Phaser,
Excalibur, matter-js, rapier2d-compat) kept in an isolated `competitors/`
manifest — see `competitors/package.json` and `competitors/link.ts` for why
they're excluded from the workspace install.

## Setup

```sh
pnpm --filter @codexo/exojs-bench bench:setup   # installs + links the competitor libs (one-time, ~235MB)
pnpm --filter @codexo/exojs-bench bench         # runs the benchmark
```

Everything else the package offers:

```sh
pnpm --filter @codexo/exojs-bench bench --domain=physics   # the CPU-only physics matrix
pnpm --filter @codexo/exojs-bench bench:compare \
  --rendering .workspace/output/baseline/results.json \
  --physics .workspace/output/physics/results.json        # generate the published comparison
pnpm gate:bench:structural                                # the structural counter gate (also a CI lane)
pnpm --filter @codexo/exojs-bench gate:timing             # the manual timing gate
```

## What it measures

Two domains, selected with `--domain` (default `rendering`):

- **`rendering`** drives a real headless Chromium against the real GPU. For each
  matrix cell — one `(engine, config, backend, archetype, nodeCount)` combination
  — it builds a scene, warms it up, then renders a fixed number of timed frames
  from `requestAnimationFrame`, sampling per-frame CPU time, full-frame time and
  draw-call structure.
- **`physics`** runs entirely in Node — no browser, no GPU: a straight loop over
  `world.step`, sampling per-step CPU time plus body and contact counts.

Everything below describes the rendering domain.

A cell's scene comes from a fixed **archetype** (`src/rendering/archetypes.ts`):
`static-heavy`, `dynamic-heavy`, `deep-hierarchy`, `lifecycle-churn`,
`overdraw`, `batch-breaking`, `batch-breaking-atlased`, `split-screen`,
`mixed-blend`, `mixed-material`, `mixed-material-atlased`, `instanced-batch`,
`mixed-sprite-mesh-static`, `mixed-sprite-mesh-array`, `scrolling-world`,
`text-static`, `text-dynamic`, `filter-chain-1`, `filter-chain-2`,
`filter-chain-4`, `mask-clip`. Each pins nesting depth, texture count, per-frame
mutation fraction and whatever dimension it exists to isolate, and sweeps a
ladder of node counts.

Most of them are readable as a DELTA against another row, which is where their
value is: `lifecycle-churn` differs from `dynamic-heavy` only in destroying the
leaves it would otherwise have moved, so the difference between the two rows is
what structural invalidation costs; `text-dynamic` differs from `text-static`
only in re-setting strings; each `filter-chain-*` step adds one render-target
pass. Every archetype also declares whether a cross-arm comparison of it is
meaningful at all (`crossArm`) - the ExoJS-internal probes say no, and the
published comparison excludes them by construction.

Text is compared on each library's GLYPH-ATLAS path, never its canvas-raster
one: ExoJS SDF text, Pixi `BitmapText` (not `Text`, which rasterizes one canvas
texture per node), Phaser `BitmapText` over a `RetroFont` grid, Excalibur
`SpriteFont`. The last two have no dynamic font generation, so they parse a
generated digit sheet the harness supplies; `src/rendering/digitAtlas.ts` states
what that buys them.

The physics domain's archetypes work the same way: `box-stack`, `many-dynamic`,
`mixed-static-dynamic`, plus `raycast` (the mixed scene with 64 ray queries per
step), `body-churn` (the many-dynamic scene with 5 % of its bodies destroyed and
rebuilt per step) and `joints` (chains of 8 bodies on revolute constraints). The
per-cell seed is keyed on the SCENE rather than on the archetype, so a query or
churn row and its base row simulate the byte-identical world and their delta
carries one cause. Every arm builds the identical scene from the
identical seed; the harness asserts that by comparing each arm's mutation-index
signature against a canonical selection and failing the cell loudly on any
divergence.

What is **not** measured: game-loop update, input, physics (in the rendering
domain), asset loading, GC headroom — everything outside `mutate` +
`renderFrame`. A benchmark millisecond is not a game frame.

## Metrics

| column                                         | what it is                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cpuMsMedian` / `cpuMsP95`                     | wall clock bracketing `mutate` + `renderFrame`, per frame. The primary metric: the CPU cost of the render path.                                       |
| `frameMsMedian` / `frameMsP95`                 | GPU time for the frame, from a HARDWARE clock (see below).                                                                                            |
| `queueMsMedian` / `queueMsP95`                 | WebGPU only: queue occupancy attributed to the frame that caused it. A different measurement from `frameMs*`, not a second opinion on it (see below). |
| `drawCalls` / `textureBinds` / `bufferUploads` | per-frame counts from a probe wrapped around the live graphics context.                                                                               |
| `status`                                       | `ok`, `exceeded` (aborted on a sustained slowdown), or `unavailable` (never measured).                                                                |
| `note`                                         | per-cell disclosure: which frame-time source was used, why a cell aborted, which counters were skipped.                                               |

Frame time is never fabricated, and its source differs per backend — which
matters when reading a WebGL2 row against a WebGPU one:

- **WebGL2** uses the hardware `EXT_disjoint_timer_query_webgl2` query when the
  browser exposes it (browsers gate it behind privacy policy), discarding any
  sample the driver flags as disjoint. The query brackets `mutate` +
  `renderFrame`, so it covers the frame's WHOLE GL command stream — uploads
  (`texSubImage2D`) included.
- **WebGPU** uses hardware `timestamp-query` writes around each of the frame's
  render passes, summed per frame. The feature is obtained by requesting it on
  every device the page creates (additively, identically for every arm) and the
  writes are injected into the render-pass descriptors the arm hands to
  `beginRenderPass`; query slots are resolved once, after the timed window, so
  the instrument adds no wait to the measured path. This covers render-pass
  EXECUTION only: `queue.writeBuffer` is a queue operation outside every command
  buffer, so its device copy cannot be bracketed by any timestamp pair. On an
  upload-heavy frame that copy is the dominant GPU cost — `queueMs*` is the
  column that sees it.
- **Fallback**: the delta between consecutive `requestAnimationFrame` callbacks,
  which is display-present cadence rather than GPU work. Cells that fall back to
  it say so in their `note`.

### `queueMs*`, and why it is not the WebGPU frame time

`queueMs*` is the `queue.onSubmittedWorkDone` wall clock, with each frame charged
only the interval past the PREVIOUS frame's observed completion
(`doneAt − max(submitAt, previous doneAt)`). Completion is cumulative, so without
that attribution one stall is reported by every frame submitted behind it —
measured on a 1M-node cell, a single 27.7ms upload event was reported by three
consecutive frames as `27.74 / 27.13 / 27.43`; attributed, it reads
`27.74 / 0.03 / 1.09`. Warmup work is drained at the warmup/timing boundary for
the same reason.

It is nonetheless NOT a per-frame GPU time, and was demoted out of `frameMs*`
because of what the instrument's floor is. `onSubmittedWorkDone` reports when the
browser OBSERVES completion, not when the GPU finished: a rAF-paced submit that
clears the canvas swapchain — 2µs of GPU work by the hardware clock — reports
0.50ms, and the identical clear into an offscreen texture reports 3.18ms, because
a present flushes the device and nothing else does. Real frames land in both
regimes, which is why the old WebGPU `frameMsMedian` was bimodal between ~0.6 and
~3.0ms run to run while the GPU work behind it never moved. Read `queueMs*` for
large events (uploads, stalls); never as a small-frame GPU time.

### Diagnostic drivers

Two frame-series probes live beside the matrix harness. Neither runs during a
matrix cell; both share the harness's page, server and launch flags so their
numbers are produced under the same conditions.

```sh
pnpm perf:webgpu:stall   # per-frame selection/capacity/upload/allocation counters
pnpm perf:webgpu:timer   # per-frame timer methodology: raw vs attributed queue
                         # latency vs hardware timestamps, plus serialized /
                         # canvas-clear / offscreen-clear control arms and the
                         # clock + scheduler controls behind the floor above
```

**Do not compare a WebGL2 frame-time column against a WebGPU one as if the two
came from the same instrument.** Both are hardware clocks, but they bracket
different things — WebGL2 the whole command stream, WebGPU the render passes —
and the gap is not small: the same `retained scrolling-world 100k` cell measures
0.397ms on WebGL2 and 0.065ms on WebGPU. `cpuMs*` is measured identically
everywhere and is the column to compare across backends and arms.

The structural counters are the durable half of the report: exact, deterministic
and reproducible where a timing is not. A non-empty scene that reports zero draw
calls fails the cell rather than reporting the undercount.

## Median vs p95

`median` is the amortised cost of a typical frame. `p95` is the frame the player
feels.

Both are needed, because an optimisation that converts per-frame work into
_periodic_ work improves the median exactly as much as one that removed the work
— while the worst frame is unchanged. The report marks such a row `hitching` when
`cpuMsP95` is at least 4x `cpuMsMedian` **and** at least 8 ms. A `hitching` row
means the two columns answer different questions and the median must not be
quoted on its own.

Percentiles use the nearest-rank method on the sorted samples
(`index = ceil(p / 100 * n) - 1`). The timed-frame count shrinks as node count
grows (see below), so a 100k+ cell has 30 samples and its p95 is the second-worst
of those 30 — a real worst-case indicator, but a coarse one. Read it next to
`timedFrames`, which every report row carries for exactly this reason.

### Why `scrolling-world` needs p95

`scrolling-world` is the only archetype with content outside the view, and the
only one with a moving camera: its leaves are laid out over four times the
viewport's area, so roughly 25% are visible at any moment, and the camera travels
the world diagonal at a fixed speed, reflecting off the world edges on a path
that is a closed form in the frame index.

That makes its cost distribution bimodal by construction. A large static world
can keep its renderable state persistent while the camera moves, so moving the
camera does not require rebuilding the visible scene from scratch — most frames
touch only what entered or left the view, and the frames that revalidate a larger
part of the world are periodic rather than per-frame. A median over that
distribution reports the cheap frames and hides the expensive ones entirely.

So on `scrolling-world`: quote `cpuMsP95`, or both columns, never the median
alone. This is the archetype the `hitching` marker exists for.

## Warmup and timed frames

Both counts are derived from the cell's node count and recorded per row in the
report, so a median over 30 frames is never presented as equal in confidence to
one over 120.

| node count      | warmup frames | timed frames |
| --------------- | ------------: | -----------: |
| < 5 000         |            10 |          120 |
| 5 000 – 24 999  |            10 |           90 |
| 25 000 – 99 999 |            25 |           60 |
| >= 100 000      |            40 |           30 |

Warmup settles shader compilation, texture upload and JIT; its frames are
discarded. It scales _up_ with node count precisely because the timed window
scales _down_ — a warmup shortfall would eat a far larger share of a 30-frame
window than of a 120-frame one. It is additionally capped at 10 s of wall clock,
so a pathological cell stops warming instead of grinding.

Timed frames are driven from `requestAnimationFrame`, one measured frame per
callback. A cell aborts as `exceeded` when the trailing 3-frame median exceeds
200 ms (a sustained slowdown, not a single GC or scheduler spike), or when one
frame alone exceeds 2 000 ms. Outside the page, the driver abandons any cell that
returns no result within 60 s as `unavailable` and relaunches the browser — a
mid-frame GPU-driver stall cannot be interrupted from inside the page.

## Browser and environment

- Headless Chromium via Playwright (`channel: 'chromium'`), launched with
  `--force-device-scale-factor=1` so `devicePixelRatio` is 1 and the canvas
  backing size is deterministic. WebGPU adds `--enable-unsafe-webgpu`.
- No software rasterizer is ever forced. `--use-angle=swiftshader` and
  `--enable-features=Vulkan` are deliberately absent; either would land the run
  on SwiftShader and make every timing worthless.
- The page is served **cross-origin isolated** (COOP + COEP), which lifts the
  browser's Spectre clamp on `performance.now()` from ~100 µs back to ~5 µs.
  Without it the cheap cells quantise to the timer floor.
- Fixed 1280x720 canvas, a **fresh canvas per cell**, with the previous cell's GL
  context force-lost so contexts cannot pile up past the browser's live-context
  cap.
- **One browser session per arm**, holding all of that arm's cells, with each cell
  fully initialising and tearing down its engine.
- Engine source is compiled with `__DEV__ = false` and served through the real
  shader loader. A dev build carries per-frame diagnostics no shipped game runs,
  and would be measured against competitors' production dist bundles.

## Provenance stamped into every report

`results.json` / `results.md` carry, per backend:

- **GPU adapter identity.** On WebGL2 the unmasked `WEBGL_debug_renderer_info`
  renderer string, read from the stage canvas's own context after the first
  measured cell — not from a throwaway canvas, which can report a different
  adapter on a multi-GPU machine. On WebGPU the adapter's vendor / architecture /
  device / description.
- **`software`** — the honesty bit. A WebGL2 run on a software rasterizer marks
  every timing column `UNTRUSTED` in the Markdown report; a software WebGPU
  adapter is refused outright and its cells are emitted `unavailable`.
- Launch flags, headless flag, engine version, ISO timestamp.
- The WebGPU sprite-batch texture-slot tier (8 / 16 / 32) negotiated for the
  adapter, so a slot-sensitive archetype's measured code path stays auditable
  across machines.
- Each competitor library's exact version and the path it resolved from.

The physics domain additionally records the Node version, CPU model, logical CPU
count and OS.

**Gap worth knowing:** the rendering domain records the GPU, not the host. CPU
model, RAM, OS build, GPU driver version and Chromium build are _not_ captured
automatically — record them by hand alongside any run you intend to quote.

## Reproducing a single scenario

Every selection flag accepts a comma-separated list, and `--nodes` _replaces_ the
archetype's own ladder rather than filtering it, so an off-ladder probe needs no
source edit:

```sh
pnpm --filter @codexo/exojs-bench bench \
  --domain=rendering \
  --engine=exojs --config=current \
  --archetype=scrolling-world \
  --nodes=1000000 \
  --backend=webgl2,webgpu \
  --out=.workspace/output/my-run
```

No `--` separator is needed; pnpm forwards these straight to the script. The run
writes `results.json`, `results.csv` and `results.md` into `--out` (default
`.workspace/output/baseline/`, gitignored), plus a `checkpoint.jsonl` appended per
cell as it lands, so a crash never discards finished work.

Other flags:

- `--backend=webgl2` / `--backend=webgpu` — omit for both.
- `--engine`, `--config`, `--archetype`, `--nodes` — comma-separated selections.
- `--frames=N` — override every cell's timed-frame count for a fast spot check.
  **Never for a quoted run:** it flattens the per-node-count budgets the
  `timedFrames` column exists to make honest.
- `--profile` — run the selected cells under the V8 CPU sampler and print self
  time by source file and by function instead of measuring wall clock. It answers
  "which code made the frame expensive", never "how expensive is the frame", and
  its output is deliberately printed rather than written into `results.*`.

Any run that narrows the matrix prints `SUBSET RUN — not a reportable comparison`.
That is expected for a targeted question: it warns about scope, not correctness.
A subset run's numbers are valid for the cells in it and are not a matrix result.

## How to read a result — and how not to

- **A number belongs to a machine.** GPU, driver, Chromium build, thermal state
  and engine commit all move it. Reproduce locally before comparing against
  anything recorded here.
- **Compare within one invocation.** Cross-arm and cross-backend claims rest on
  the arms having run back to back in the same process on the same machine. Two
  invocations are two browser sessions, and not a comparison.
- **For a before/after of an engine change, measure a single cell per
  invocation.** Within one invocation an arm's cells share a browser session, and
  accumulated driver/adapter state has been observed to move — in one case invert
  — the verdict of a multi-archetype run.
- **`nodeCount` is the world total, not the drawn count.** On `scrolling-world`
  only about a quarter of it is on screen; the rest is the off-screen content
  under study.
- **Rows at 100 000+ nodes are marked `beyond-frame-budget`.** They are stress
  probes past any interactive budget, not target configurations.
- **Never turn a benchmark millisecond into an FPS claim.** `cpuMs*` covers the
  render path only — no update, input, physics, asset work or GC headroom, and no
  vsync.
- **Never quote a median from a `hitching` row on its own**, and never quote a
  timing from an `exceeded` or `unavailable` cell: those statuses exist to record
  that the cell produced no trustworthy distribution.
- **Structural counters travel better than timings.** `drawCalls` and
  `bufferUploads` are deterministic; a claim meant to survive a hardware change
  should be made about those.

## Reference result: `scrolling-world` at 1M sprites

A dated reference point, measured on **one** machine. It is not a hardware
minimum, not a maximum capability, and not an FPS guarantee — it is a
reproduction target: the same command on the same class of machine should land in
the same neighbourhood, and a large deviation is worth investigating.

- Date: 2026-08-15 · ExoJS 0.15.2
- GPU: NVIDIA GeForce RTX 5070 Ti · headless Chromium via Playwright
- Cell: `engine=exojs config=current archetype=scrolling-world nodes=1000000` —
  1 000 000 static sprites laid out over 4x the viewport's area with a moving
  camera, 40 warmup frames, 30 timed frames

| backend | CPU median |  CPU p95 | frame median | frame p95 | draw calls / frame |
| ------- | ---------: | -------: | -----------: | --------: | -----------------: |
| WebGL2  |   0.402 ms | 10.08 ms |     0.330 ms |   1.17 ms |                  1 |
| WebGPU  |   0.380 ms | 10.45 ms |      2.98 ms |   4.66 ms |                  1 |

Reading notes, in the order they matter:

- **CPU p95 is the headline, and it is a CPU number.** 10.08 ms is the
  95th-percentile time the engine spent in the render path on the CPU, i.e. the
  second-worst of 30 timed frames. It is neither GPU frame time nor a whole game
  frame.
- **The two frame-time columns come from different instruments** — a hardware
  timer query on WebGL2, a queue-completion wall clock on WebGPU (see
  [Metrics](#metrics)) — and are not comparable 1:1 across the two rows.
- **One draw call on both backends** is the structural fact behind the timings:
  the visible world is drawn as a single batched submission even while the camera
  moves. The table's per-frame `1` is derived. The report itself prints the
  window's raw total in that column — `drawCalls = 30` over 30 timed frames —
  with the note `structural counters did not divide evenly over 30 frame(s); raw
totals reported`, which trips on this cell because a sibling counter
  (`bufferUploads`) has no whole-frame quotient. Divide the column by
  `timedFrames` when a cell carries that note.
- **This is one workload.** `scrolling-world` is a deliberately extreme static
  world. Nothing here generalises to a million _animated_ sprites, to other
  archetypes, or to other hardware.

For context on where those numbers came from: before the engine kept its
renderable state persistent across camera movement, the same cell measured a CPU
p95 of 203.14 ms on WebGL2 and 234.19 ms on WebGPU, and the WebGPU cell aborted at
the harness watchdog after 26 frames instead of completing its timed window. The
medians were already low then — only p95 showed the per-frame rebuild. That is the
concrete reason this archetype is quoted on p95.

Numbers produced by the engine's internal Node-side CPU stubs — isolated
CPU-path measurements with no browser and no GPU, used while iterating on a change
— are a different measurement entirely. They are not comparable with the table
above and are never published as ExoJS performance figures.

## The two regression gates

They guard different defect classes and are deliberately unlike each other.

**Structural** (`pnpm gate:bench:structural`) compares exact integer
draw/bind/upload counters against `baselines/structural.json`. The values are
decided CPU-side, so they do not drift and the baseline carries no tolerance
band: any deviation fails, as does a guarded cell that disappears or stops
measuring. It catches the fault that renders the identical picture and is merely
expensive - a batching collapse from 782 to 25 000 draw calls passes every
correctness test.

It runs on the software rasterizer, which is what puts it in CI. That its
counters are genuinely backend-independent was measured, not assumed: every
archetype was run on a real GPU and on SwiftShader, and all three counters came
out byte-identical everywhere except `batch-breaking` (does not complete on a
software rasterizer) and `text-dynamic` (aborts there as too slow). Those two are
unguarded, named in the source with the reason; no counter needed a tolerance.
Re-record with `--update` in the same commit as an intended change.

**Timing** (`pnpm --filter @codexo/exojs-bench gate:timing`) compares wall-clock
medians against `baselines/timing.json` and is a RELEASE PRECONDITION invoked by
hand on a machine you have confirmed idle. It is not a hook and not a CI job:
the matrix needs an idle machine, a push is by definition not one, and a gate
that goes falsely red gets bypassed.

A cell fails when its median exceeds the baseline by more than 25 % **and** by at
least 0.5 ms. The absolute floor is not a softening - without it the gate is
unusable on sub-millisecond cells: two consecutive runs of the same code on the
same machine put 15 of 42 cells over 25 %, the smallest moving 0.060 ms to
0.095 ms. p95 is reported on every row and gates nothing, being the noisier
statistic. The committed baseline is stamped `confirmedIdle: false` and the gate
repeats that caveat on every run; re-record it with `--update --idle` on a quiet
machine before relying on it for a release.

Correctness assertions stay in the test suite, which is fast, CI-resident and
needs no GPU. Nothing moved out of it: the gates add the other defect class -
faults that look correct and are merely expensive.

## The published comparison

`bench:compare` reads a run's `results.json` and generates the comparison
document. It is generated, never hand-maintained, because a hand-written
comparison drifts from the harness and once it drifts the honesty is gone
without anyone noticing.

Rules the generator enforces rather than merely intends:

- Rows are archetypes; categories are section headings. Nothing aggregates
  across archetypes, because any mean over a category hides its worst cell.
- Verdicts are computed from the two medians. A ratio inside 0.8-1.2 is `level`
  (the matrix's own noise band); outside it the faster arm `leads`, and at 5x or
  more `leads clearly` - a gap too large for machine mood to explain.
- One node count for the whole table, chosen from the archetype ladders BEFORE
  any timing is read, then lowered until every arm produced a valid cell. It can
  never be picked per row.
- Every row names the mechanism behind its difference, drawn from the structural
  counters. A row whose mechanism cannot be evidenced is not published - it is
  listed under Omissions with the reason, so a dropped row stays auditable.
- One column per competitor, no "best competitor" composite. Phaser occupies its
  own WebGL1 block, CPU time only, explicitly carrying no mechanism.
- Cells where ExoJS loses are published exactly like the cells where it wins.

## Cross-library numbers

The harness runs competitor arms, and no cross-library figure is published in the
ExoJS documentation. Publishing one requires all of: a frozen version of every
library involved, an identical scenario across arms, identical browser and
hardware conditions, the harness for each arm published alongside the numbers, the
caveats stated with the result, and a defined process for re-measuring when any of
those move. Until that exists, a cross-library number measured here is an
engineering signal for the maintainers, not a claim.

## Why this package is out of required CI

`bench:setup` runs `pnpm install --dir competitors --ignore-workspace`. That
`--ignore-workspace` install:

- resolves a **separate lockfile** outside `pnpm-workspace.yaml`, so it
  bypasses the root workspace's `minimumReleaseAge` supply-chain quarantine
  (see `pnpm-workspace.yaml`) — a version bump here needs a manual release-age
  sanity check instead of the automatic gate everything else gets;
- pulls in ~235MB of competitor libraries that a normal contributor should
  never have to download just to typecheck their own PR.

Running that inside the shared-CI trust boundary (a required, always-on gate)
would mean every contributor's PR — and the shared CI runners — install and
trust third-party libraries whose only purpose is being compared against, not
shipped. So `@codexo/exojs-bench` is deliberately excluded from
`typecheck:packages` / `verify:quick` / CI. A standalone `typecheck:bench`
root script exists for on-demand/manual runs:

**The one exception is the structural gate**, and it is an exception precisely
because it needs none of that: it measures only the ExoJS arms on the software
rasterizer, so its CI job installs no competitor library and needs no GPU.
Nothing in that job runs `bench:setup`, so the competitor packages never enter
the CI trust boundary. It is path-gated on the rendering source, the harness and
the baseline itself — narrower than the `engine` area, since a change to audio or
input cannot move a draw-call count.

```sh
pnpm typecheck:bench   # bench:setup + typecheck, in one step
```

## Local backstop: the pre-push hook

`.husky/pre-push` runs a **path-gated, local-only** check on branch pushes:

- it fires **only** when the commits being pushed touch
  `packages/exojs-bench/**` — zero cost for every other push;
- if the competitor deps are already linked locally (i.e.
  `packages/exojs-bench/node_modules/pixi.js` exists from a prior
  `bench:setup`), it runs `pnpm --filter @codexo/exojs-bench typecheck` and
  **fails the push** on a type error;
- if they aren't linked, it prints a warning telling you to run `bench:setup`
  and **skips without failing** — an optional, uninstalled dependency should
  never block an unrelated push.

## Known gap

This is a local, path-gated backstop, not a CI gate — it only runs on the
machine that pushes a bench-touching commit, and only if that machine has
already run `bench:setup`. An engine API change under `src/` that breaks the
bench adapters' types, without a commit that also touches
`packages/exojs-bench/**`, is not caught by this hook.

The structural-gate CI lane closes part of that gap, but only part: a change
under `src/rendering/` now runs the harness (and therefore compiles and executes
the ExoJS adapters) in CI, so a break there fails a PR. A change elsewhere under
`src/` still does not, and neither does anything that only affects a competitor
adapter. This is
an accepted trade-off to keep the bench package's ~235MB of competitor
dependencies out of the shared-CI trust boundary entirely. A future
self-hosted-GPU bench tier (see the engine's perf-tracking roadmap) is the
right place to run a full, unconditional `typecheck:bench` as a real backstop.
