# @codexo/exojs-bench

The repository's rendering and physics comparison harness. This is development tooling, not a game-runtime dependency. It produces versioned measurements and provenance for the [benchmark site](https://exoridus.github.io/ExoJS/en/benchmarks/).

## What the results mean

Rendering scenarios measure CPU-side frame work in the harness's declared region. Structural counters describe submissions and resource operations where an adapter can observe them. Physics scenarios measure CPU time per simulation step. These instruments are not interchangeable with GPU execution time, display latency, memory use, or complete-game frame rate.

A scenario compares supported, equivalent work at its declared load. Unsupported cells are absent, not zero. The headline scenario order is fixed independently of the result. There is no overall score or engine winner.

## Set up and reproduce

From the repository root:

```sh
pnpm bootstrap:dev
pnpm --filter @codexo/exojs-bench bench:reference --out run-1
pnpm --filter @codexo/exojs-bench bench:reference --out run-2
pnpm --filter @codexo/exojs-bench bench:reference --out run-3
```

Use the platform declaration required by your host, as described in the [results instructions](results/README.md). Each invocation is independent; three repetitions inside one warmed process are not the same acquisition procedure. Competitor dependencies live in the benchmark's private competitor workspace, separate from the public runtime packages.

[Publish a machine profile](results/README.md) only after the required runs pass compatibility and provenance checks. Diagnostic runs with a narrowed workload are useful locally but do not become an unrestricted published profile merely by changing their filename.

## Read before changing a comparison

The [harness methodology](docs/harness.md) owns measurement regions, pooling, workload selection, fairness, and publication rules. The [adapter contract](src/rendering/adapters/README.md) owns how another rendering library joins the harness. The [results README](results/README.md) owns acquisition and profile provenance. The site reads their generated results; do not copy volatile ratios into unrelated documentation.

Counters can explain a plausible mechanism, but a draw-count difference alone does not prove the cause of a timing difference. Measure the proposed mechanism or identify it as an interpretation. A content hash detects inconsistent profile content; it is not an external attestation that a benchmark was run on the claimed hardware.

## Contributing

Typecheck and test a changed adapter or measurement rule before acquiring new results. CI validates the harness and its policies; shared CI timing is not substituted for the controlled reference measurements. Do not alter measured result data to make a prose claim or a regression gate pass.
