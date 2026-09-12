# @codexo/exojs-bench

Runs ExoJS and the other 2D libraries through the same scenes, in a real browser
against a real GPU, and prints what each one costs per frame.

Private to this repository, never published to npm. The competitor libraries
(Pixi, Phaser, Excalibur, matter-js, planck, rapier2d-compat) live in their own
`competitors/` manifest, so a normal `pnpm install` downloads none of them.

## Setup

Once per checkout, ~235 MB:

```sh
pnpm --filter @codexo/exojs-bench bench:setup
```

## Run one

```sh
pnpm --filter @codexo/exojs-bench bench
```

That is the full rendering matrix and takes a while. For a first look, ask for
one scenario:

```sh
pnpm --filter @codexo/exojs-bench bench --archetype=fx-blur --backend=webgl2
```

```
=== Results ===
  ┌──────────┬──────┬─────────┬────────────────┬────────┬─────────┬───────┬────────┐
  │ scenario │ load │ backend │ arm            │ cpu ms │ cpu p95 │ draws │ status │
  ├──────────┼──────┼─────────┼────────────────┼────────┼─────────┼───────┼────────┤
  │ fx-blur  │  720 │ webgl2  │ exojs current  │  0.230 │   0.310 │     4 │ ok     │
  │ fx-blur  │  720 │ webgl2  │ exojs retained │  0.220 │   0.255 │     4 │ ok     │
  │ fx-blur  │  720 │ webgl2  │ pixi default   │  0.120 │   0.205 │     3 │ ok     │
  └──────────┴──────┴─────────┴────────────────┴────────┴─────────┴───────┴────────┘
```

The same rows land in `results.json`, `results.csv` and `results.md` in the
output directory the run names at the end.

### Reading a row

- **load** is what the scenario scales: sprites for most of them, but tiles,
  particles, widgets or a render height for others. The unit is in `results.md`;
  the number alone does not carry it.
- **cpu ms** is the median time one frame spent in JavaScript - the scene's
  per-frame work plus submitting it. This is the comparable number.
- **cpu p95** is the same window's 95th percentile. Far above the median means
  the cost arrives in periodic spikes, which a player feels as a hitch and a
  median alone hides; the harness marks those `hitching`.
- **draws** is draw calls per frame, counted by wrapping the graphics context.
  It is what says _why_ one arm is faster, and a row whose timing moved without
  its draw count moving usually moved for a reason outside the engine.
- **status** is `ok`, `exceeded` (the cell went past the harness's frame budget
  and was stopped early), or `unavailable` with a reason recorded in the report.

Physics runs print the same shape with `step ms`, the bodies actually simulated
and the contacts resolved.

### Narrowing a run

Every selection flag takes a comma-separated list.

| Flag                          | What it selects                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `--domain=rendering\|physics` | Which matrix to run. Default `rendering`.                                        |
| `--archetype=`                | Scenarios, by id.                                                                |
| `--engine=` / `--config=`     | Arms - `exojs`, `pixi`, `phaser`, `excalibur`, and each one's configs.           |
| `--backend=webgl2\|webgpu`    | Graphics backend.                                                                |
| `--browser=chromium\|webkit`  | Browser the run is measured in. Default `chromium`.                              |
| `--nodes=` / `--bodies=`      | **Replaces** the scenario's ladder, so an off-ladder probe needs no source edit. |
| `--frames=`                   | Timed frames per cell. Thin sampling; for looking, not for publishing.           |
| `--out=`                      | Output directory.                                                                |
| `--capture=`                  | Write a PNG of each cell's last frame, to see what was measured.                 |
| `--profile`                   | V8 CPU profile of one cell, by file and by function. Chromium only.              |

A run that uses any of these prints `SUBSET RUN - not a reportable comparison`
and means it: the published comparison is a whole matrix measured in one go.

## Producing numbers worth publishing

One run does not support a claim - the same code on the same idle machine moves
a cell's median far enough to flip which arm leads. So a published measurement is
**three separate runs**, pooled:

```sh
pnpm --filter @codexo/exojs-bench bench:reference --out run-1
pnpm --filter @codexo/exojs-bench bench:reference --out run-2
pnpm --filter @codexo/exojs-bench bench:reference --out run-3

pnpm --filter @codexo/exojs-bench bench:compare --profile \
  --rendering run-1/rendering/results.json \
  --rendering run-2/rendering/results.json \
  --rendering run-3/rendering/results.json \
  --physics run-1/physics/results.json \
  --physics run-2/physics/results.json \
  --physics run-3/physics/results.json
```

`bench:reference` measures both domains at each scenario's headline load. Three
separate invocations, on an otherwise idle machine, back to back - repeating the
matrix inside one process shares JIT and heap state and measures the same warm
state three times. Pass **none** of the narrowing flags above, `--capture`
included: each one marks the run a subset, and a subset does not publish.

`bench:compare` publishes the median of the per-run medians, the spread those
runs showed, and a verdict only where all three agreed on one. It refuses to pool
runs that are not repetitions of the same measurement - a different machine,
browser, platform or engine version among them.

`--profile` writes the pooled comparison to `results/` as a signed machine
profile. On macOS and Linux add `--platform=<major>` (with `-beta` if the OS is a
pre-release build), because those systems do not report their own product
version.

## The gates

```sh
pnpm gate:bench:structural                     # draw/bind/upload counters against a committed baseline
pnpm --filter @codexo/exojs-bench gate:timing  # the manual timing gate
```

The structural gate runs on a software rasterizer and compares integer counters,
so it gives the same answer on any machine and runs in CI. The timing gate reads
wall clocks and does not.

## Contributing your machine's numbers

The published comparison pages are generated from one JSON file per machine in
[`results/`](./results/) - and every machine that is not in there yet is a gap.
Different GPUs, different operating systems, and WebKit against Chromium all
reorder these results, and no single developer owns enough hardware to find that
out.

If you have a machine that is not represented:

1. Follow [Producing numbers worth publishing](#producing-numbers-worth-publishing)
   above, with `--profile` on the `bench:compare` call.
2. Open a pull request containing **only** the one new file in `results/`.
   Nothing else needs to change; the published pages pick it up from there.

The file is named after your machine and browser, derived from what the harness
stamped rather than typed by hand, so re-measuring a machine updates its own file
and can never overwrite someone else's. A validation gate checks on every CI run
that a profile pools at least three runs, that its provenance is complete, and
that its signature still recomputes - which only `bench:compare` can write. If it
rejects your file, re-run the harness rather than editing it.

[`results/README.md`](./results/README.md) has the details: what a profile
contains, how the browser and platform flags change it, and what the pooling
rules refuse.

## Going deeper

[`docs/harness.md`](./docs/harness.md) is the reference: every scenario and what
it is for, what each metric does and does not mean, how warmup and timed frames
are chosen, what the harness pins about the browser, what provenance is stamped
into a report, how to read a result and how not to, and what the published
comparison is allowed to claim.
