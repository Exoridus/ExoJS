# @codexo/exojs-bench

Private, reproducible cross-library rendering/physics benchmark harness for ExoJS.
Not published. Compares ExoJS against competitor libraries (Pixi, Phaser,
Excalibur, matter-js, planck, rapier2d-compat) kept in an isolated `competitors/`
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
  --rendering run-1/results.json \
  --rendering run-2/results.json \
  --rendering run-3/results.json                          # generate the published comparison
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
- **`physics`** drives a real headless browser too, but no GPU: a straight loop
  over `world.step` inside the harness page, sampling per-step CPU time plus
  body, contact, joint and ray-hit counts.

  It is measured in a browser rather than in the driver's Node process because
  nobody runs ExoJS physics in Node, and because the runtime is part of what a
  step time measures: heap limits, garbage collection and WASM compilation are
  the browser's, and the JavaScript engine is whichever the selected browser
  ships. Measured on the same machine, moving the matrix from Node into Chromium
  moved per-step medians by −80% to +29% depending on the arm, which is enough to
  reorder the arms against each other; measuring it in WebKit instead moves them
  again. A physics number is therefore only comparable against another taken in
  the same browser, and `--browser` applies to this domain exactly as it does to
  rendering.

Everything below describes the rendering domain, except the physics sections that
name themselves.

A cell's scene comes from a fixed **archetype** (`src/rendering/archetypes.ts`):
`static-heavy`, `dynamic-heavy`, `deep-hierarchy`, `lifecycle-churn`,
`overdraw`, `batch-breaking`, `batch-breaking-atlased`, `split-screen`,
`mixed-blend`, `mixed-material`, `mixed-material-atlased`, `instanced-batch`,
`mixed-sprite-mesh-static`, `mixed-sprite-mesh-array`, `scrolling-world`,
`text-static`, `text-dynamic`, `filter-chain-1`, `filter-chain-2`,
`filter-chain-4`, `mask-clip`, `composite`. Each pins nesting depth, texture count, per-frame
mutation fraction and whatever dimension it exists to isolate, and sweeps a
ladder of node counts.

Most of them are readable as a DELTA against another row, which is where their
value is: `lifecycle-churn` differs from `dynamic-heavy` only in destroying the
leaves it would otherwise have moved, so the difference between the two rows is
what structural invalidation costs; `text-dynamic` differs from `text-static`
only in re-setting strings; each `filter-chain-*` step adds one render-target
pass; `composite` is `filter-chain-1`'s scene rendered as a bloom-shaped
multipass (off-screen capture, downscaled blur, direct draw, additive overlay),
so the two rows separate one node-attached filter from an explicit multipass
over the same content. Every archetype also declares whether a cross-arm comparison of it is
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

### Physics body-count ladders

Each physics archetype sweeps **its own body-count ladder**, placed so its rungs
straddle a 60 fps frame: two inside the frame and one past it. They are not
interchangeable — at a fixed body count the archetypes differ by nearly an order
of magnitude, so `many-dynamic` reaches a whole frame at 2 200 bodies while
`joints` does not until 15 000. One shared ladder therefore spends most of its
rungs on scenes nobody could ship for the expensive archetypes and never reaches
the interesting region for the cheap ones.

| archetype              | ladder                 | native median per step  |
| ---------------------- | ---------------------- | ----------------------- |
| `box-stack`            | 3 000 / 5 500 / 10 000 | 4.05 / 9.02 / 18.88 ms  |
| `many-dynamic`         | 800 / 1 500 / 2 200    | 4.57 / 10.59 / 17.31 ms |
| `mixed-static-dynamic` | 900 / 1 700 / 3 200    | 4.08 / 8.51 / 17.17 ms  |
| `raycast`              | 900 / 1 700 / 3 200    | 6.48 / 12.40 / 19.80 ms |
| `body-churn`           | 800 / 1 500 / 2 400    | 2.67 / 9.14 / 18.99 ms  |
| `joints`               | 4 500 / 9 000 / 15 000 | 6.28 / 10.52 / 17.44 ms |
| `settling-pile`        | 1 500 / 3 000 / 5 800  | 3.04 / 8.43 / 17.23 ms  |

The medians are a placement sweep of the native arm alone on one machine
(Ryzen 7 3700X, Chromium) over a thin timed window. They locate each frame
crossing and are not a published measurement.

An archetype that is read as a **delta** against another shares at least one rung
with it, which is what the delta needs: `seedFor` folds the body count in, so two
archetypes that name the same scene build the identical world only at a count
both ladders contain. `raycast` and `mixed-static-dynamic` share their whole
ladder, `body-churn` shares two rungs with `many-dynamic`, and `settling-pile`
shares one.

**Moving a rung changes the scene, not just its size.** Because the seed folds in
the body count, numbers taken at an earlier ladder describe different worlds and
are not comparable with these; there is no conversion between them, and nothing
published is carried across. `--bodies` filters the matrix rather than replacing
a ladder (unlike the rendering domain's `--nodes`), so an off-ladder probe needs
a source edit.

The physics arms are not one flat field of competitors. **matter-js** and
**planck** are the pure-JS **peers** — the libraries an ExoJS app would
realistically attach instead of the native runtime, and what `exojs-physics` is
compared against. **rapier** is a Rust engine compiled to WASM and is read as the
**reference ceiling**: it measures what leaving JavaScript buys, not a bar a JS
solver is expected to reach. Each arm's solver iterations, sleeping default and
contact-count semantics are disclosed per arm in every report's caveats block.

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
pnpm perf webgpu:alloc   # per-frame allocation, wall-clock or work-unit counters, one browser per cell
pnpm perf webgpu:timer   # per-frame timer methodology: raw vs attributed queue
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

- **`--browser=chromium` (default) or `--browser=webkit`**, both headless via
  Playwright. The choice belongs to the run, not to the harness: it is stamped
  into every provenance block and forms part of the published profile's file
  name, so a WebKit number can never be read as a Chromium one and the two never
  pool into one profile.
- Chromium is launched on the `chromium` channel with
  `--force-device-scale-factor=1` so `devicePixelRatio` is 1 and the canvas
  backing size is deterministic. WebGPU adds `--enable-unsafe-webgpu`.
- WebKit is launched with **no arguments at all**: every flag here is a Chromium
  one, and its stamp records an empty flag set rather than claiming a launch
  that never happened. Nothing is lost by it - the harness page sizes its own
  1280x720 backing store and the Pixi arm pins `resolution: 1`, so no
  measurement depends on a pinned device scale factor.
- **A backend the selected browser does not expose produces no number.** WebKit
  reaches WebGPU on macOS alone; elsewhere `navigator.gpu` is undefined and every
  WebGPU cell is emitted `unavailable` with that reason attached, exactly as a
  refused software adapter is.
- `--profile` (the V8 CPU sampler) is Chromium-only, because the sampler is
  driven over a CDP session. It refuses in any other browser rather than falling
  back and attributing one engine's frame cost to another engine's name.
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

- **GPU adapter identity.** On WebGL2 the `WEBGL_debug_renderer_info` renderer
  string, read from the stage canvas's own context after the first measured cell
  — not from a throwaway canvas, which can report a different adapter on a
  multi-GPU machine. On WebGPU the adapter's vendor / architecture / device /
  description. How much this identifies is the browser's choice: Chromium
  unmasks the device model, while WebKit substitutes a constant vendor-level
  string (`Apple GPU`) for it on every platform — including a Windows machine
  with an NVIDIA card — so a WebKit profile is named after the CPU model
  instead, which the physics domain records.
- **Browser and browser version**, as the browser reported it, plus the
  operating system of the host that drove it.
- **`platformVersion`** — the operating system's major version and what
  established it: `detected` where the host reports one (Windows, whose
  `10.0.<build>` release string names Windows 11 from build 22000 up), or
  `declared` from `--platform`. It is separate from the `os` field because that
  field carries the kernel release, which on macOS no longer tracks the product
  version.
- **`prerelease`** — whether the platform is a pre-release build, and a `source`
  saying what that rests on: `detected` from a browser version string naming a
  non-shipping build, `declared` from `--platform=<major>-beta` (needed for a
  beta OS, which is not readable at runtime), or `assumed-stable`, which records
  that nothing established it and is weaker than a stable platform.
- **`software`** — the honesty bit. A WebGL2 run on a software rasterizer marks
  every timing column `UNTRUSTED` in the Markdown report; a software WebGPU
  adapter is refused outright and its cells are emitted `unavailable`.
- Launch flags, headless flag, engine version, ISO timestamp.
- The WebGPU sprite-batch texture-slot tier (8 / 16 / 32) negotiated for the
  adapter, so a slot-sensitive archetype's measured code path stays auditable
  across machines.
- Each competitor library's exact version and the path it resolved from.

The physics domain records the browser and browser version, the CPU model,
logical CPU count, OS and architecture of the host that drove it, and what the
measuring page's `performance.now()` could resolve. It does **not** record the
driver process's Node version: no step was taken there, so a field naming it
would describe nothing about where the numbers came from.

### Physics timing resolution

The fastest cells of the physics matrix step in single-digit microseconds, and
`performance.now()` is clamped as a Spectre mitigation. The harness page is
served cross-origin isolated (COOP/COEP), which lifts the clamp to 5 µs in
Chromium and 20 µs in WebKit — measured per run, not assumed, and stamped into
the provenance.

A step that cannot clear that grid on its own is not timed on its own. Each cell
estimates its per-step cost from the last 60 warmup steps and then times steps in
batches large enough for one sample to span 20 clock ticks, dividing the sample
by its batch. The batch is recorded per row as `stepsPerSample`; `1` means every
step was timed individually and the row is byte-for-byte the old contract. The
**timed-step budget is unchanged** — the batch only decides how finely the fixed
window is sampled — and the batch stops growing once a cell would be left with
fewer than 12 samples, because a median and a p95 need a distribution behind
them. A cell that hits that cap before clearing the grid says so in its `note`,
naming the quantisation it still carries, rather than reporting a coarse number
that looks precise.

**Gap worth knowing:** the rendering domain records the GPU, the browser and the
operating system, but not the rest of the host. CPU model, RAM and GPU driver
version are _not_ captured automatically — record them by hand alongside any run
you intend to quote.

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

No `--` separator is needed with `pnpm --filter …`; pnpm forwards these straight
to the script. Running the same script from inside `packages/exojs-bench`
(`pnpm bench -- --out=…`) works too, and `--out` is then relative to the package
directory either way. The root `pnpm bench` forwards here as well; the engine's
own `vitest bench` micro-benchmarks are `pnpm bench:micro`, and there is no root
`bench:compare`.

The run writes `results.json`, `results.csv` and `results.md` into `--out`
(default `.workspace/output/baseline/`, gitignored), plus a `checkpoint.jsonl`
appended per cell as it lands, so a crash never discards finished work.

Other flags:

- `--browser=chromium` (default) / `--browser=webkit` — the engine to measure in.
  Not a subset marker: a run in either browser is a full measurement of that
  browser, published under its own profile.
- `--platform=<major>` / `--platform=<major>-beta` — declare the operating
  system's major version, and with the suffix that the build is a pre-release
  one. Required on macOS and Linux, whose kernel version names no product
  version; optional on Windows, which reports its own and refuses a declaration
  contradicting it. A full run without it fails before measuring anything, a
  narrowed run only warns. Pass it on **every** pooled run: both the version and
  the beta marker are part of the profile's file name, and runs disagreeing on
  either are refused rather than pooled.
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

`bench:compare` reads the `results.json` files of several runs and generates the
comparison document. It is generated, never hand-maintained, because a
hand-written comparison drifts from the harness and once it drifts the honesty
is gone without anyone noticing.

### A reference measurement is three runs

A published claim is a ratio between two arms, and one run does not support one:
the same code measured twice on this machine moved a physics cell's median by
2.5x with byte-identical contact counts behind both runs, which was enough to
reverse seven verdicts. That spread was observed while physics still ran in the
driver's Node process; it has not been re-derived since the matrix moved into the
browser, so read it as the reason for pooling rather than as this harness's
current noise figure. So `--rendering` and `--physics` are **repeatable, once
per run**, and the runs are pooled:

```sh
pnpm --filter @codexo/exojs-bench bench --out run-1
pnpm --filter @codexo/exojs-bench bench --out run-2
pnpm --filter @codexo/exojs-bench bench --out run-3
pnpm --filter @codexo/exojs-bench bench:compare \
  --rendering run-1/results.json --rendering run-2/results.json --rendering run-3/results.json
```

A single path still behaves exactly as it always did. The runs must come from
**separate invocations**, each with its own `--out` directory: repeating a matrix
inside one process shares JIT and heap state across the repetitions and measures
the same warm state several times, which is the effect the repetition exists to
expose.

Per cell, the pooled comparison publishes the median of the per-run medians, the
median of the per-run p95s, the range those runs observed (printed in brackets
beside the value), the frame-budget mark where the pooled median is past 16.7 ms,
and a stability flag: the verdict is computed from each run separately, and the
cell is stable only when every run reached the same one. **An unstable cell
publishes no verdict** - it keeps its row, its value and its range, and states
what each run said instead.

`bench:compare` refuses to pool runs that are not repetitions of one measurement:
a differing engine version, a differing set of arms or versions, a differing set
of measured cells, a row that landed on a different count in one run than in
another, or a differing machine.

The machine check is what a second reference machine makes necessary — three
runs from two machines would otherwise pool into a median belonging to neither,
with a spread reporting the gap between two computers as the noise of one. A
rendering run's identity is the normalized GPU the adapter string names, the
operating system with its major version and pre-release bit, and the browser,
using the same normalizations the profile slug uses, so runs may pool exactly
when they would be written to one file. A physics run's identity is the CPU
model, the same platform identity, the architecture, and the browser. Tolerated within one
machine: timestamps, an adapter string's driver / device-id / shader-model tail,
the OS patch level, and the browser's patch version, which a checkout pins and
which every stamp records in full anyway. Assembling one profile from a
rendering measurement on one machine and a physics measurement on another is
refused for the same reason.

One limit is inherent: where the browser reports a constant instead of the GPU,
a rendering run identifies its machine no more precisely than that constant
does, because the CPU model that names it in the file is recorded by the physics
domain. Two such machines on the same operating system and browser are
indistinguishable to the check.

Rules the generator enforces rather than merely intends:

- Rows are archetypes; categories are section headings. Nothing aggregates
  across archetypes, because any mean over a category hides its worst cell.
- Verdicts are computed from the two medians. A ratio inside 0.8-1.2 is `level`
  (the matrix's own noise band); outside it the faster arm `leads`, and at 5x or
  more `leads clearly` - a gap too large for machine mood to explain.
- A row's count is chosen from the archetype ladders BEFORE any timing is read -
  the largest rung at which every arm produced a valid cell - so it can never be
  picked to suit an outcome. A rendering table goes further and uses one node
  count for every row, because its archetypes share their ladders.
- Physics rows each state their OWN body count, because each physics archetype
  has its own ladder and their intersection is empty. Rows are therefore not
  comparable with one another; only the arms within a row are, which is what the
  table is for. Two rows were always two different scenes — the shared count made
  that look otherwise.
- Every value is a median AND the p95 of the same timed window. Verdicts are
  computed from the medians alone; the p95 is the step or frame a player feels,
  so a pair far apart hitches where the median reads as comfortable. There is no
  p99: the largest cells time 120 steps, so a p99 there is the second-worst
  sample rather than a percentile.
- A median past **16.7 ms** — a whole 60 fps frame — is marked. The line is the
  entire frame deliberately: how much of a frame this work may take is the
  reader's decision, but a step or frame costing more than the frame it has to
  fit in is unplayable regardless of that decision. Nothing is derived from the
  mark; a "bodies at N ms" capacity figure would interpolate between rungs rather
  than report a measurement.
- Every row names the mechanism behind its difference, drawn from the structural
  counters. A row whose mechanism cannot be evidenced is not published - it is
  listed under Omissions with the reason, so a dropped row stays auditable.
- One column per competitor, no "best competitor" composite. Phaser occupies its
  own WebGL1 block, CPU time only, explicitly carrying no mechanism.
- Cells where ExoJS loses are published exactly like the cells where it wins.

### Machine profiles

`bench:compare --profile` additionally writes the comparison as JSON into
`results/`, one file per machine, named
`<machine>-<os>-<major>[-beta]-<browser>.json` after the provenance — the GPU or,
where the browser reports a constant instead of one, the CPU model; the
operating system with its major version and pre-release marker; and the browser.
The name is derived from the stamps, so
re-measuring a machine overwrites its file and a different machine can only
arrive as a new one. Each file carries every pooled run's provenance and a
signature over its own contents, and `verify:bench-results` (in the `lint` gate
group) rejects a file that pools fewer than three runs, or whose signature does
not recompute - which is what keeps a typed number and a one-run claim out. See
[`results/README.md`](./results/README.md).

## Cross-library numbers

The harness runs competitor arms, and no cross-library figure is published in the
ExoJS documentation. Publishing one requires all of: a frozen version of every
library involved, an identical scenario across arms, identical browser and
hardware conditions, the harness for each arm published alongside the numbers, the
caveats stated with the result, and a defined process for re-measuring when any of
those move. Until that exists, a cross-library number measured here is an
engineering signal for the maintainers, not a claim.

## What runs in CI, and what does not

Three different things live in this package, and CI treats them differently.

**The harness's own tests** (`test/`) exercise the profile contract, the slug,
the signature, the run pooling and the archetype definitions. They need none
of the competitor libraries - the adapters that import those are loaded by
`import()` inside the benchmark page, never by a test - so they run in the
ordinary `pnpm test` project list on every push, like any other package.

**The typecheck** does need the competitors: the adapters are typed against
their APIs, which is exactly what catches an upstream change on a version
bump. `pnpm typecheck:bench` installs them first. It runs in the path-gated
`bench` CI lane, alongside the structural gate, whenever a change touches this
package, the rendering source or the baselines.

**Measurements** never run in CI. A shared runner is neither idle nor a known
machine, and a number it produced would carry provenance nobody can reproduce.
Reference profiles are measured by hand on an idle machine and committed as
signed files - see `results/README.md`.

## The competitor install and the supply-chain gate

`bench:setup` runs `pnpm install --dir competitors --frozen-lockfile`. The
`competitors/` directory is its own workspace root (it carries a
`pnpm-workspace.yaml`), which does two things: a plain root `pnpm install`
never resolves or downloads anything in it, so a contributor who never
benchmarks pays nothing for ~235MB of libraries whose only purpose is being
compared against; and the install applies the same `minimumReleaseAge`
quarantine the repository workspace enforces, so a version bump here is held
back exactly as long as any other dependency. The lockfile is frozen in both
CI and local use: a new version enters through a reviewed lockfile change, not
through an install.

`pnpm doctor` reports whether the competitors are linked.
