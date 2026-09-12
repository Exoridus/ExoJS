# Published benchmark profiles

One JSON file here is one **machine profile**: everything `bench:compare`
computed from a reference measurement on one machine, plus the provenance needed
to judge and reproduce it. The published comparison pages are generated from
these files and from nothing else.

A file is named after the machine it describes,
`<machine>-<os>-<major>[-beta]-<browser>.json` - for example
`rtx-5070-ti-windows-11-chromium.json` or `m3-max-macos-27-beta-webkit.json`.
The name is derived by the harness from the stamped provenance, never typed by
hand, so **re-measuring the same machine overwrites its file** and a different
machine can only ever arrive as a new one.

- **machine** - the GPU the adapter string names, with vendor and product-line
  words dropped, so `NVIDIA GeForce RTX 5070 Ti` becomes `rtx-5070-ti` and
  `Apple M3 Max` becomes `m3-max`. Some browsers report a constant instead of
  the device - WebKit reports `Apple GPU` on every machine, including one with
  an NVIDIA card in it - and a vendor-only integrated part can reduce to a bare
  `graphics`. Neither names a machine, so the **CPU model** takes over, exactly
  as it does for a profile written from a physics measurement alone. Where that
  substitution happens the GPU is part of the CPU's package, so the CPU model
  names it correctly. The CPU model is recorded by the physics domain, so a
  rendering-only profile whose adapter names nothing cannot be named at all and
  is refused: measure physics on the same machine and pass it to `--physics`.
- **os** and **major** - the operating system and its major version. The version
  is in the name because a measurement on a pre-release platform and one on the
  shipping release it becomes describe different conditions; without it the
  second would silently replace the first. Windows reports its own version;
  macOS and Linux do not, and the runner declares it (see below).
- **beta** - present when the platform is a pre-release build.
- **browser** - part of the name because it is part of the measurement: the same
  machine measured in Chromium and in WebKit publishes two files, and their
  numbers are not comparable with each other. Both domains are measured in a
  browser - physics touches no GPU, but the JavaScript engine is what executes
  its steps - so a profile written from physics alone names its browser too, and
  a document whose two domains were measured in different browsers is refused
  rather than named after one of them.

## A reference measurement is three runs

A published claim is a ratio between two arms, and one run does not support one.
The same code measured twice on the same idle machine moves a cell's median far
enough to reverse which arm it leads - measured, with byte-identical simulation
behind both runs. So a profile pools **at least three separate runs per domain**,
and for every cell it publishes:

- the **pooled value**: the median of the per-run medians, so one unlucky run
  cannot set the number, and beside it the median of the per-run p95s;
- the **spread**: the smallest and largest per-run median, and their ratio - the
  measurement's own noise, printed beside the value it belongs to;
- the **stability flag**: the verdict is computed from each run separately, and
  the cell is stable only when every run reached the same one;
- the **frame-budget mark**: whether the pooled median is past 16.7 ms, a whole
  60 fps frame. It is recomputed from the pooled value rather than inherited
  from a run.

**An unstable cell publishes no verdict.** It keeps its row, its pooled value and
its range, and states what each run said instead. That the cell cannot be
measured to that resolution on this machine is a finding about the measurement,
not a row to hide.

The runs must come from **separate invocations of the harness**, each with its
own output directory. Repeating a matrix inside one process shares JIT and heap
state across the repetitions, so it measures the same warm state three times
rather than the spread the repetition exists to expose.

## What a file contains

- the schema version, so a reader can reject a file it does not understand;
- the machine profile: slug plus the machine, operating system and browser parts
  it was derived from, the platform spelled out in parts (name, major version,
  whether that version was read or declared, whether the build is pre-release),
  the engine version, when it was measured, and how many runs every measured
  domain pools;
- one rendering provenance entry per run (each with one stamp per backend:
  adapter string, browser and browser version, operating system and its major
  version, pre-release status, launch flags, headless and software-rasterizer
  bits, engine version, timestamp) and one physics provenance stamp per run
  (browser and browser version, CPU host with the same platform version,
  pre-release status, fixed timestep, the measuring page's clock resolution,
  disclosed caveats, engine version, timestamp);
- the library arms with their exact installed versions;
- the pooled comparison itself, per rendering backend and for physics, including
  every published median and p95 with its spread, stability flag and
  frame-budget mark, the count each row was measured at, the verdict where the
  runs agreed on one, the mechanism behind each row, and the rows that were
  measured but excluded, with the reason;
- a signature over all of the above.

## Two numbers, one line, one count per row

Every value is published as a **median and a p95** of the same timed window. The
median is the field-comparable number and the only one a verdict is computed
from; the p95 is the step or frame a player feels as a hitch, so a pair far apart
describes periodically expensive work that a median alone would report as cheap.
There is no p99 - the largest cells time 120 steps, which makes a p99 there the
second-worst sample rather than a percentile.

A median past **16.7 ms** carries a mark. That is the whole 60 fps frame and not
a fraction of it: how much of a frame a reader may spend on this work depends on
everything else their frame does and is their decision, while a single step or
frame that costs more than the frame it must fit in is unplayable whatever they
decide. Nothing is derived from the mark - a file carries no "bodies at N ms"
capacity figure, because that would interpolate between the ladder's rungs
instead of reporting something measured.

Every row states the **count it was measured at**, chosen from that archetype's
ladder before any timing was read. A rendering block puts every row on one node
count, because its archetypes share their ladders. The physics archetypes do not:
each has its own body-count ladder, placed so its rungs straddle the frame
budget, and they reach a frame at sizes that differ by nearly an order of
magnitude. **Physics rows are therefore not comparable with one another** - only
the arms within one row are, which is what a row is for. Two rows were always two
different scenes; stating the count per row is what stops them looking otherwise.

The physics ladders moved when they were placed against the frame budget, and a
moved rung is a **different scene** rather than the same one measured again: the
per-cell seed folds the body count in. No published file predates that, so there
is nothing here to migrate and no conversion is offered; a physics number taken
at an older ladder simply describes a world this directory does not contain.

A file may carry one domain or both. `rendering` is absent when the profile was
written from a physics measurement alone and `physics` when it was written from
a rendering measurement alone; a missing domain means "not measured on this
machine".

## Producing one

```sh
pnpm bootstrap:dev                 # installs and links the competitor libraries too

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

`bench:reference` measures both domains at each scenario's headline load and
writes `run-N/rendering/results.json` and `run-N/physics/results.json` under
`packages/exojs-bench/`. `--rendering` and `--physics` are repeatable, once per
run, in run order; both domains of a profile pool the same number of runs.

Pass no narrowing flag on a reference run - not `--capture`, `--frames`,
`--backend`, `--archetype`, `--nodes`, `--engine` or `--config`. Each marks the
run a subset, and a subset is not reportable.

Measure on an otherwise idle machine, and run the repetitions back to back
rather than days apart: these are wall-clock comparisons, and background load
moves them.

`bench:compare` refuses to pool runs that are not repetitions of one
measurement - a differing engine version, a differing set of arms or versions, a
differing set of measured cells, a row that landed on a different count in one
run than in another, or **a different machine, browser, platform version or
pre-release status** - because a median over values that were never comparable
describes the difference between two runs rather than the noise of one. What that tolerates within one machine: the timestamps, the driver and
device-id tail of an adapter string, and the operating system's patch level.
What it does not: a different GPU, a different operating system or major version
of one, a different browser, or one run on a beta platform among runs on a
shipping one.

## Choosing a browser

```sh
pnpm bench -- --browser=webkit --out=run-1
```

`--browser` takes `chromium` (the default) or `webkit`. It selects the engine
the run is measured in, is stamped into every provenance block, and lands in the
file name, so the two never merge into one profile.

`--browser` applies to `--domain=physics` as well. Physics involves no GPU, but
its numbers are not runtime-neutral: the same matrix under a different JavaScript
engine moves per-step medians by multiples and reorders the arms against each
other, which is exactly what a second reference machine exists to find out.

The choice is not free of consequences, and the harness does not hide them. A
backend the selected browser does not expose is emitted as `unavailable` cells
carrying the reason - WebKit reaches WebGPU on macOS alone, so a WebKit run
elsewhere publishes an empty WebGPU block rather than a number under the wrong
heading. A physics arm the browser cannot construct is emitted the same way,
carrying the loader's reason, rather than dropped from the matrix. Launch flags
are Chromium's; a WebKit stamp records an empty set rather than claiming flags it
never passed. CPU profiling (`--profile`) needs the V8 sampler and refuses
outright in any other browser. WebKit also substitutes a constant for the GPU, so
a WebKit profile is named after the CPU model and needs a physics measurement of
the same machine beside the rendering one.

## Declaring the platform

```sh
pnpm bench -- --platform=27-beta --browser=webkit --out=run-1
```

`--platform` states the operating system's **major version** and, with the
`-beta` suffix, that the build is a pre-release one. Both facts are carried by
one flag on purpose: a runner who states the version of a beta operating system
cannot then forget to say that it is a beta, which is the omission that would
publish a pre-release measurement under a shipping platform's name. The value is
validated - a plausible major version, not arbitrary text - and is normalized
into the file name like every other part.

Windows reports its own version (`os.release()` gives `10.0.26200`, and the
Windows 10/11 split is the build number, not the major), so the flag is optional
there and a value contradicting the host is refused. macOS and Linux report the
kernel version instead, which names no product version - the macOS 15-to-26 jump
broke the last mapping anyone relied on - so the flag is **required** on them
for any run that could be published. A run that narrows the matrix only warns;
a full one refuses to start, before it measures anything.

Every stamp records how the version was arrived at: `detected` when the host
reported it, `declared` when the runner stated it, with the evidence beside it.

A measurement taken on a beta operating system or a preview browser build does
not describe what anyone ships, so it also says so in a `prerelease` stamp whose
`source` says what the value rests on:

- **`detected`** - the browser's own version string names a non-shipping build
  (`beta`, `canary`, `dev`, `nightly`, `preview`, `alpha`, `tp`). Nobody has to
  remember anything for this to fire.
- **`declared`** - the runner passed `--platform=<major>-beta`. Needed because an
  operating system's release status **cannot be read at runtime**.
- **`assumed-stable`** - neither applied. This records that nothing established
  the platform's status. It is a weaker statement than a stable platform and
  must not be read as one.

If you measure on a beta OS, pass the `-beta` suffix on **every** run: pooling
one declared run with two that forgot it is refused, precisely so a
half-pre-release profile cannot pass as a stable one.

## Submitting one

A profile for a machine that is not in this directory is welcome as a pull
request containing that one file. Nothing else needs to change - the published
pages pick it up from here.

`verify:bench-results` validates every file in this directory on every run of
the `lint` gate group: the schema version has to be known, the profile has to
pool at least three runs, the provenance has to be complete for each of them,
the versions consistent, and the signature has to recompute from the file's own
contents. Only `bench:compare` writes that signature, so a value edited
afterwards - or a file assembled by hand - is rejected. If the gate rejects your
file, re-run the harness rather than editing the file: the numbers are only
worth publishing if a measurement put them there.
