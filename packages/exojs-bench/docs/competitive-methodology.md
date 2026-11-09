# Competitive benchmark methodology

The competitive command extends the existing rendering matrix, scene definitions, adapters, Vite host, capture path and provenance collector. It does not replace the reference suite or publish into `results/`. Its outputs are diagnostic evidence until hardware identity, workload equivalence, measurement quality and visual correctness have been reviewed. The [architecture and historical review](competitive-review.md) records the implementation audit, open dependencies and previous claims; the [existing harness contract](harness.md) remains authoritative for adapter boundaries.

## Reproduce an acquisition

Use a clean checkout, the repository's supported Node and pnpm versions, and the lockfiles. Complete `pnpm bootstrap:dev` and install the Playwright Chromium browser using `pnpm exec playwright install chromium` if bootstrap has not provisioned it. Keep competitor installation in `packages/exojs-bench/competitors`; `bench:setup` installs and links the pinned versions. Do not install floating competitor versions in the root workspace.

From the repository root:

```sh
pnpm bench:competitive --help
pnpm bench:competitive --list
pnpm bench:competitive --scenario=B03 --load=all --dry-run
pnpm bench:competitive --mode=quick --scenario=B03 --software --out=run-smoke
pnpm bench:competitive --mode=quick --scenario=B03 --capture --out=run-visual
pnpm bench:competitive --scenario=B03 --engine=exojs,pixi,phaser --backend=webgl2 --out=run-dirty-cpu --machine="controlled desktop" --driver="record actual driver version" --power="AC, fixed performance policy" --background="idle, monitoring recorded"
pnpm bench:competitive --scenario=B03 --engine=exojs,pixi --backend=webgpu --profile=gpu --out=run-dirty-gpu --machine="controlled desktop" --driver="record actual driver version" --power="AC, fixed performance policy" --background="idle, monitoring recorded"
pnpm bench:competitive --mode=deep --scenario=tilemap-edit --runs=7 --out=run-tile-profile
pnpm bench:competitive --mode=long-run --engine=exojs --scenario=dirty-10,lifecycle-churn --cycles=100 --frames=600 --out=run-lifecycle
pnpm bench:competitive --report=run-dirty-cpu/competitive.json --out=run-dirty-report
pnpm bench:competitive --report=run-after/competitive.json --baseline=run-before/competitive.json --out=run-regression
```

The root command delegates to the benchmark package, so relative paths resolve there. Use fresh `run-*` directories, which the repository already ignores, or absolute paths. Acquisition refuses to overwrite existing evidence. Report-only output can be regenerated from the raw session. In PowerShell, quote comma-containing arguments. Supply `--platform` in the existing harness syntax where automatic platform detection needs an operator declaration. The example declarations above are placeholders, not hardware evidence; replace them with the actual conditions. All four declarations default to `UNRECORDED`, which disqualifies comparisons.

`--scenario` accepts exact scenario IDs and Bxx groups; B03 expands to seven dirty rates. `--nodes` overrides the catalog load ladder explicitly. Invalid flags, unsupported scenario names and malformed budgets fail before browser startup. `--dry-run` prints the exact capability-gated cells and requested unsupported combinations. Phaser has no selected WebGPU arm. A selection with no runnable cells is not a successful measurement.

| Mode                | Default acquisition                                                                          | Intended interpretation                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `quick`             | One fresh process, 2 warmup frames, 5 measured frames, deep instrumentation                  | Functional smoke and separate visual capture; no performance claim. Software rendering is allowed only here. |
| `standard`          | Seven fresh processes, 90 warmup frames and 300 measured frames per cell, CPU timing profile | Primary repeated CPU acquisition on controlled hardware.                                                     |
| `deep`              | One process, 90 warmup frames, 300 measured frames, detailed instrumentation                 | Mechanism investigation; request multiple independent runs when comparing costs.                             |
| `long-run`          | One process, 20 scene cycles per arm, 90 warmup and 600 measured frames per cycle            | Scene recreation, coarse heap trend and stability investigation; cycles are not independent repetitions.     |
| Report / regression | Reads saved sessions, starts no browser                                                      | Reproducible descriptive analysis and comparison of compatible measured commits.                             |

Frame counts are configurable. The wall-clock warmup duration and actual measured counts are recorded; a capped warmup or aborted cell cannot be admitted as a complete acquisition. Explicit sampling requests receive a bounded driver deadline that accommodates paced rendering down to 10 Hz, plus setup/collection allowance. A deadline failure states that scheduling, slow work and driver stalls have not been distinguished. It does not establish a GPU defect.

## Workloads and fair comparison

The catalog contains 22 implemented workloads across ten requested groups. Most reuse existing scenes rather than duplicate adapters. It describes the work actually performed, its load unit, three representative loads and supported backends. Unsupported features are visible gaps, not zero-cost measurements.

| Group | Implemented scenarios                                                             | Scope and important limits                                                                                                               |
| ----- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| B01   | `static-heavy`                                                                    | Static depth-4 tree, one texture.                                                                                                        |
| B02   | `dynamic-heavy`, `deep-hierarchy`                                                 | Leaf translation at nominal 7.5% or 1%; no claim about rotation, scale or parent mutation.                                               |
| B03   | `dirty-0`, `dirty-1`, `dirty-10`, `dirty-25`, `dirty-50`, `dirty-75`, `dirty-100` | One otherwise identical flat scene at all seven rates.                                                                                   |
| B04   | `dynamic-all`                                                                     | All leaves translate; alpha, textures, rotation and scale remain fixed.                                                                  |
| B05   | `batch-breaking`, `atlased`                                                       | Forty texture identities versus one-texture control. The control does not measure atlas construction or frame animation.                 |
| B06   | `fill-layers`, `mixed-blend`                                                      | Translucent full-screen layers and blend plateaus; Phaser is excluded from mixed blend because its adapter does not implement that work. |
| B08   | `scrolling-world`, `tilemap-scroll`, `tilemap-edit`                               | Camera/culling and tile paths; the tile-edit camera is fixed, and Phaser does not cover the scrolling sprite world.                      |
| B10   | `text-static`, `text-dynamic`                                                     | Glyph-atlas labels; label counts are not sprite counts.                                                                                  |
| B11   | `particles-draw`                                                                  | Deterministic particle rendering. Full particle lifecycle equivalence remains unqualified.                                               |
| B12   | `lifecycle-churn`                                                                 | Node creation/removal with shared textures; not a texture-residency benchmark.                                                           |

B07 sprite-sheet animation, B09 vector paths, B13 a realistic integrated game scene, GPU texture/buffer churn and broader transform mutation are explicit future work. B14 is provided as repeated existing scene lifecycles rather than a new continuous multi-hour game scene. Neither camera movement nor node churn alone substitutes for these missing workloads. The catalog's gap list remains machine-readable.

ExoJS `current` and `retained` remain separate arms. Pixi `default` and `culled` remain separate where the scene supports both. Phaser uses its existing `webgl2` configuration with an injected WebGL2 context; historical `phaser/default` WebGL1 results are not relabelled. The framework invokes the established update and render boundary for each adapter. This is an adapter-level rendering comparison with framework-specific internal work, not a claim that full game loops have identical abstraction costs. No new renderer-only Phaser path or engine-specific fast path is introduced.

All selected cells use the existing 1280 x 720 render surface, DPR 1, shared deterministic textures and seed `0xc0ffee`. Resolution and DPR are recorded and checked. This version does not expose a new arbitrary-resolution sweep. Sprite scaling and fill-layer workloads vary CPU and pixel pressure separately within that surface. A future resolution sweep must parameterize every adapter and visual validation together.

Compare only equal scene, load, backend, seed and configuration semantics. Do not pool WebGL2 with WebGPU, current with retained, text labels with sprites, or culling configurations. Native WebGPU and WebGL2 measurements answer different questions. Additional engines should be admitted for functional fit: the existing Excalibur adapter is a useful full-framework candidate for a separately qualified extension; Two.js and Kontra.js would need distinct vector/canvas workloads rather than being forced into sprite-tree or native WebGPU comparisons. They are not included in the new three-engine command.

### Visual qualification

Run captures separately with `--mode=quick --capture`. The driver retains the scene for its PNG capture after the measurement window. The capture manifest records PNG dimensions and SHA-256 identity, with `REQUIRES_VISUAL_REVIEW` status. A screenshot's existence or hash does not prove equal visible work. Check framing, count, transform phase, texture sampling, clipping, blend order, text content and transparency. Where appropriate, compute pixel diffs under a documented tolerance, but inspect whether differences represent colour-space semantics rather than missing work.

The default ExoJS linear-light pipeline makes alpha and blending validation particularly important. A faster image with different blending is not admitted as equivalent solely because object counts match. This implementation does not yet provide automated image-equivalence admission or a signed visual review manifest. All report outputs remain `DIAGNOSTIC_ONLY` even when statistical preconditions pass.

## Dirty-rate experiment

The seven B03 scenes use the same flat container, one 8 x 8 texture, visible placement, culling policy and load ladder of 1,000 / 10,000 / 25,000 sprites. Only the mutation probability changes. Rates 0 and 100 are controls; intermediate rates use a seeded per-leaf threshold. Their selected sets are nested for a fixed seed, and their realized counts are recorded. A nominal 1% is not claimed to select exactly one hundredth of a finite population. Every adapter's mutation signature must match the canonical selection.

The measured operation is the existing common translation wobble. Dirty fraction describes selected properties written each frame, not engine-reported invalidated nodes or uploaded bytes. Those are different quantities: a leaf write may invalidate ancestors, and a retained path can upload larger regions than the directly changed leaves. Deep-profile API bytes and CPU submission help investigate that distinction.

The HTML report plots only captured CPU observations at numeric dirty-rate positions, with missing points as gaps and separate series for each backend/load/arm. It never uses the illustrative curve from a planning discussion. The analysis may identify a bracket between adjacent measured rates whose qualified comparisons change direction. It does not interpolate an exact crossover, extrapolate beyond 100%, assume monotonicity, or call an inconclusive point a win. Repeat denser measurements around a candidate bracket before making a break-even claim. A translation-only crossover does not establish a universal retained-rendering threshold for visibility, camera motion, text, materials or lifecycle work.

## Measurement boundaries

| Metric              | Source and boundary                                                                                    | Interpretation                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU frame work      | `performance.now()` around `adapter.mutate(frame)` plus `adapter.renderFrame()`                        | Synchronous JavaScript and API submission within those calls; excludes scene construction, rAF wait and asynchronous GPU execution.                                       |
| Update / submission | Extra clocks around the same two calls in deep profile                                                 | Adapter-level split, not a decomposition of transform, geometry, dirty-state and command-building internals.                                                              |
| rAF cadence         | Consecutive browser callback timestamps                                                                | Presented scheduling cadence, including VSync and browser scheduling; not unbounded rendering throughput. N measured frames yield N-1 intervals.                          |
| WebGL2 GPU          | `EXT_disjoint_timer_query_webgl2`, `TIME_ELAPSED_EXT`                                                  | Hardware query around timed work, with asynchronous result collection and disjoint rejection.                                                                             |
| WebGPU GPU          | `timestamp-query` on every tracked render pass in a frame                                              | Sum of valid render-pass durations; excludes copies/uploads outside passes and gaps between passes. It is not interchangeable with a whole WebGL command-stream interval. |
| WebGPU completion   | CPU submit-to-`onSubmittedWorkDone` observation                                                        | Includes queue backlog and callback scheduling; neither GPU execution time nor a bound on the whole frame.                                                                |
| API counters        | Wrappers on the actual context/device/queue used by an adapter                                         | Observed API calls and supplied byte ranges; not verified hardware execution, completed shader compilation or resident memory.                                            |
| JS heap             | Optional `performance.memory.usedJSHeapSize` at lifecycle checkpoints and every 60 deep-profile frames | Coarse browser API observation; unavailable stays null. It does not measure VRAM or establish a leak.                                                                     |

The timing profile avoids frame GPU queries, API wrappers, heap sampling and the extra CPU split clocks. WebGPU warmup work is drained once outside its timed window even when timing probes are disabled. The GPU profile enables GPU queries without detailed API counters. Deep profile adds both CPU splits and counters. Compare separate acquisitions of identical scenes and independent runs to quantify instrumentation effects; do not subtract an assumed constant overhead. The profiles have different protocol identities and are not pooled into a single performance ratio. No actual instrumentation overhead has been measured in the constrained implementation environment.

GPU query handling is asynchronous and bounded. WebGL invalidates affected pending queries on a disjoint state and yields to the event loop while waiting. WebGPU rejects incomplete frames, unresolved or non-positive pairs, unsubmitted buffers, repeated submission and query-capacity overflow rather than reporting partial render work as a complete frame. Sample indices and attempted/valid/invalid/unresolved/skipped counts preserve coverage. Optional collection failure keeps CPU evidence and marks hardware timing unavailable. There are no synchronizing pixel readbacks in the measured path. Readback/resolve submissions used by collection occur after the detailed counter snapshot and after its probe detaches.

The legacy `frameMs` field receives an explicit source. The existing comparison builder only emits a GPU number for a declared hardware source; old unlabelled values and rAF cadence cannot become GPU timings. Missing measurements appear as null with an unavailable/unmeasured interpretation, never a guessed zero. Hardware GPU ratios require complete coverage; partial data remain visible diagnostics.

Deep API telemetry separates buffer allocation requests from uploads and counts supplied upload bytes with typed-array range semantics. It also records texture upload calls, program/pipeline binds, render passes, queue submits, resource create/destroy calls and shader/pipeline creation requests. Structural totals are stored explicitly alongside any legacy per-frame fields. WebGPU bind-group calls are not relabelled as texture binds. Mapped writes, GPU-to-GPU copies, texture byte totals, live resident VRAM, driver allocations, process-wide memory, reliable GC events and CPU utilization are not measured by these probes. Do not infer them from missing fields. Warmup counters are reset; measured-window creation/destruction is not a whole-session resource census.

## Acquisition identity and statistics

Each repetition is a fresh Node process. The established driver launches fresh browser sessions per engine/config/backend arm. Within a repetition, order is shuffled reproducibly from the run index. A repetition pairs arm observations under the same declared host conditions; it does not make them simultaneous. Keep the machine idle, record power and thermal conditions, close unrelated GPU workloads, and avoid editing or changing the checkout during acquisition. A changed source stamp invalidates the repetition. Use a dedicated clean worktree for archival measurements.

Every session records its complete plan, protocol hash and options. Each run records timestamps, a unique run ID, run index, source commit/tree, dirty state, tracked-diff hash, workspace and competitor lock hashes, OS, CPU, memory, Node version and operator declarations. Existing driver provenance records browser/version/flags, backend, engine/library versions, clock resolution and observed device information. Actual per-cell renderer evidence is additionally required for comparative admission; a generic backend label is insufficient.

The reporter rejects incomplete repetitions, duplicate identities, absent/duplicate cycles or cells, different source/protocol/host/library conditions, software or unknown devices, incomplete warmup, mismatched mutation signatures and CPU measurements below 20 clock increments. Missing cells stay visible as null rows. It does not silently discard a losing or unstable cell and recompute a winner from survivors. Failed acquisition evidence remains on disk; the process stops after a failed repetition instead of repeatedly exercising a broken host.

Within each cell, raw finite samples support mean, median, P95, P99, maximum, variance, a declared 33.33 ms stutter threshold and distributions. These describe frame-to-frame variation. Between runs, compare medians of independent acquisitions. Long-run cycles first collapse within their owning independent run and never increase the independent sample size.

For compatible paired runs, the current descriptive comparison uses the median of paired ratios, a deterministic 2,000-resample bootstrap interval and an exact two-sided sign test, with a 5% practical-effect threshold and at least five independent runs. Seven default runs allow a consistent directional difference to pass the sign test; five runs alone cannot establish a two-sided 5% result even if all signs agree. A small number of repeated runs remains weak evidence for tails or rare stutters. No outlier is removed automatically, and a confidence interval is not a guarantee of external validity.

These are exploratory comparisons across many cells; no family-wise or false-discovery correction is implemented. Confirm selected findings in a separately planned acquisition before publication or a hard regression gate. Do not average ratios over different scenes, loads, backends or instrumentation profiles. A 60 Hz rAF plateau does not establish equal CPU or GPU capacity.

## Reports, long runs and regressions

The raw `competitive.json` contains sessions, per-run outcomes and sample arrays. Each repetition also checkpoints `cells.jsonl` and `acquisition.json`. `competitive.summary.json`, `competitive.csv`, `competitive.md` and self-contained `competitive.html` are derived locally. The HTML includes dirty-rate curves, per-cell distributions and heap observations without external assets. Reports distinguish measured data, admission limitations and descriptive hypotheses; no site publication is automatic.

Long-run mode repeats create/build/warmup/render/destroy on the same arm's browser page. It records coarse heap observations before scene creation, after warmup, during measurement, after measurement and after teardown. Changing scene identity between cycles exercises the existing lifecycle. Recreating contexts and canvases can release GPU allocations even when a persistent-runtime workload would retain them, so this is not a complete persistent-engine leak experiment. GC is not forced; sawtooth heap changes, object counts and a positive trend alone do not prove leaks or fragmentation. A dedicated continuous-scene experiment and engine resource inventory are follow-up work.

To compare two ExoJS commits, run the same competitive harness/protocol and pinned competitors in independent clean worktrees containing the desired engine versions. Save each raw session and use `--report=current/competitive.json --baseline=baseline/competitive.json`. The command does not perform checkout, cherry-pick or branch mutation. Protocol and host mismatches reject the comparison. Regression output is diagnostic and cannot upgrade an unqualified acquisition into a gate. Keep the acquisition software equivalent when changing the engine commit; a simultaneous adapter or instrumentation change confounds the result.

The new browser test is discovered by the existing `bench-browser` project. It checks the three adapters, dirty-rate endpoints, raw sample retention, mutation signatures, render dimensions, actual draw observations and captured PNGs on the configured software browser. It has no elapsed-time threshold and is not hardware performance evidence. Existing named unit tests cover query invalidation, cleanup, source guards, deterministic selection, range accounting and report admission. No paid runner, new service or artifact host is introduced. Keep local raw data or attach selected artifacts to the existing repository workflow/PR within its retention policy.

Hard performance gates belong on controlled hardware after a baseline protocol, repeated-run variance and practical-effect thresholds have been established. A shared CI runner can validate functionality and produce informative trends. It must not fail a PR solely for a small timing change from this exploratory report. Existing deterministic structural gates remain separate.

Structural baseline admission is separate from scenario availability. The diagnostic `dirty-0`, `dirty-1`, `dirty-10`, `dirty-25`, `dirty-50`, `dirty-75` and `dirty-100` scenarios have no independently recorded SwiftShader/hardware counter comparison at the gate's load, so `UNGUARDED_ARCHETYPES` records them as pending qualification. Existing baseline cells and exclusions are unchanged. To admit these scenarios, acquire both ExoJS arms on WebGL2 at the gate's 200-node, three-timed-frame configuration on SwiftShader and hardware, verify identical draw/bind/upload counts, then remove their pending exclusions and deliberately record the baseline with `gate:structural --update`. Functional browser smoke validates execution and mutation semantics; it does not supply that counter baseline.

## Integration and present qualification state

This work starts from `next` without incorporating open PR branches. PR #1068 owns resolver containment, #1069 owns Phaser lifecycle cleanup, and #1070 owns actual renderer/DPR provenance. The competitive work adds sampling/telemetry to some of the same harness/type/driver files touched by #1070; rebase and review that additive integration after its merge. No copy of its renderer-identity fix is supplied here. Consequently current acquisitions without its per-cell identity remain unqualified for ratios. None of the three PR branches is modified by this work.

The implementation environment could install dependencies, typecheck and run instrument/runner/report unit tests, but could not execute a browser: the Playwright browser download failed and the installed Chromium rejected required socket creation with `EPERM`. No physical GPU samples, current engine rankings, screenshot-equivalence results, retained break-even, current-versus-historical speedup or instrumentation-overhead number was produced. The checked-in review separates proven harness defects from unmeasured engine hypotheses. Complete the browser smoke, inspect captures, integrate renderer provenance and collect repeated controlled-hardware data before interpreting a performance advantage.

### Specification references

- [WebGL2 buffer and query API](https://registry.khronos.org/webgl/specs/latest/2.0/).
- [Disjoint timer query extension](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).
- [WebGPU timestamp queries, queue writes and completion](https://www.w3.org/TR/webgpu/).
- [Existing adapter contract](../src/rendering/adapters/README.md).
