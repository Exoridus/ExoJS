# Published benchmark profiles

One JSON file here is one **machine profile**: everything `bench:compare`
computed from a reference measurement on one machine, plus the provenance needed
to judge and reproduce it. The published comparison pages are generated from
these files and from nothing else.

A file is named after the machine it describes, `<gpu>-<os>-<browser>.json`
(for example `rtx-5070-ti-windows-chromium.json`). The name is derived by the
harness from the stamped provenance, never typed by hand, so **re-measuring the
same machine overwrites its file** and a different machine can only ever arrive
as a new one.

## A reference measurement is three runs

A published claim is a ratio between two arms, and one run does not support one.
The same code measured twice on the same idle machine moves a cell's median far
enough to reverse which arm it leads - measured, with byte-identical simulation
behind both runs. So a profile pools **at least three separate runs per domain**,
and for every cell it publishes:

- the **pooled value**: the median of the per-run medians, so one unlucky run
  cannot set the number;
- the **spread**: the smallest and largest per-run median, and their ratio - the
  measurement's own noise, printed beside the value it belongs to;
- the **stability flag**: the verdict is computed from each run separately, and
  the cell is stable only when every run reached the same one.

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
- the machine profile: slug plus the GPU, operating system and browser parts it
  was derived from, the engine version, when it was measured, and how many runs
  every measured domain pools;
- one rendering provenance entry per run (each with one stamp per backend:
  adapter string, launch flags, headless and software-rasterizer bits, engine
  version, timestamp) and one physics provenance stamp per run (Node and CPU
  host, fixed timestep, disclosed caveats, engine version, timestamp);
- the library arms with their exact installed versions;
- the pooled comparison itself, per rendering backend and for physics, including
  every published value with its spread and stability flag, the verdict where
  the runs agreed on one, the mechanism behind each row, and the rows that were
  measured but excluded, with the reason;
- a signature over all of the above.

A file may carry one domain or both. `rendering` is absent when the profile was
written from a physics measurement alone and `physics` when it was written from
a rendering measurement alone; a missing domain means "not measured on this
machine".

## Producing one

```sh
pnpm bootstrap                     # installs the competitor libraries too
pnpm --filter @codexo/exojs-bench bench --out .workspace/output/run-1
pnpm --filter @codexo/exojs-bench bench --out .workspace/output/run-2
pnpm --filter @codexo/exojs-bench bench --out .workspace/output/run-3
pnpm --filter @codexo/exojs-bench bench:compare \
  --rendering .workspace/output/run-1/results.json \
  --rendering .workspace/output/run-2/results.json \
  --rendering .workspace/output/run-3/results.json \
  --profile
```

`--rendering` and `--physics` are repeatable, once per run, in run order. Repeat
the same three-run pattern for `--domain=physics` and pass both sets to one
`bench:compare`; both domains of a profile pool the same number of runs.

Measure on an otherwise idle machine, and run the repetitions back to back
rather than days apart: these are wall-clock comparisons, and background load
moves them.

`bench:compare` refuses to pool runs that are not repetitions of one
measurement - a differing engine version, a differing set of arms or versions,
or a differing set of measured cells - because a median over values that were
never comparable describes the difference between two runs rather than the noise
of one.

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
