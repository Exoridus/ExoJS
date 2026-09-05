# Published benchmark profiles

One JSON file here is one **machine profile**: everything `bench:compare`
computed from a benchmark run on one machine, plus the provenance needed to
judge and reproduce it. The published comparison pages are generated from these
files and from nothing else.

A file is named after the machine it describes, `<gpu>-<os>-<browser>.json`
(for example `rtx-5070-ti-windows-chromium.json`). The name is derived by the
harness from the stamped provenance, never typed by hand, so **re-measuring the
same machine overwrites its file** and a different machine can only ever arrive
as a new one.

## What a file contains

- the schema version, so a reader can reject a file it does not understand;
- the machine profile: slug plus the GPU, operating system and browser parts it
  was derived from, the engine version, and when it was measured;
- the rendering provenance (one stamp per backend: adapter string, launch flags,
  headless and software-rasterizer bits, engine version, timestamp) and the
  physics provenance (Node and CPU host, fixed timestep, disclosed caveats,
  engine version, timestamp);
- the library arms with their exact installed versions;
- the built comparison itself, per rendering backend and for physics, including
  every verdict, the mechanism behind each row, and the rows that were measured
  but excluded, with the reason;
- a signature over all of the above.

A file may carry one domain or both. `rendering` is absent when the profile was
written from a physics run alone and `physics` when it was written from a
rendering run alone; a missing domain means "not measured on this machine".

## Producing one

```sh
pnpm bootstrap                     # installs the competitor libraries too
pnpm --filter @codexo/exojs-bench bench
pnpm --filter @codexo/exojs-bench bench:compare --rendering <run>/results.json --physics <run>/results.json --profile
```

Measure on an otherwise idle machine: these are wall-clock comparisons, and
background load moves them.

## Submitting one

A profile for a machine that is not in this directory is welcome as a pull
request containing that one file. Nothing else needs to change - the published
pages pick it up from here.

`verify:bench-results` validates every file in this directory on every run of
the `lint` gate group: the schema version has to be known, the provenance
complete, the versions consistent, and the signature has to recompute from the
file's own contents. Only `bench:compare` writes that signature, so a value
edited afterwards - or a file assembled by hand - is rejected. If the gate
rejects your file, re-run the harness rather than editing the file: the numbers
are only worth publishing if a measurement put them there.
