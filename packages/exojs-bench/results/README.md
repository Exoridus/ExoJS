# Benchmark result profiles

This directory preserves the published, machine-specific rendering and physics profiles consumed by the site. The measured values and their provenance are evidence. Update them through the harness's acquisition and comparison commands, not by manually editing a ratio, count, or timing.

## Acquire independent runs

Set up the repository with `pnpm bootstrap:dev`, then run the complete reference workload three times in separate invocations:

```sh
pnpm --filter @codexo/exojs-bench bench:reference --out run-1
pnpm --filter @codexo/exojs-bench bench:reference --out run-2
pnpm --filter @codexo/exojs-bench bench:reference --out run-3
```

Output paths are relative to the benchmark package. On macOS and Linux, supply `--platform=<major>[-beta]` with the actual OS release; the browser cannot reliably report the required major version. Windows detection uses the harness's supported platform signals. A missing or assumed platform value is not equivalent to a verified stable release.

Use `--browser=chromium` or `--browser=webkit` as appropriate. Keep the browser, device, platform, engine revision, and workload consistent across runs intended for one profile. A prerelease declaration belongs in the provenance. `detected`, `declared`, and `assumed-stable` describe the source of that information, not three equivalent levels of proof.

For diagnosis, narrowing counts, scenarios, or other workload settings is useful. Those runs are marked as subsets and cannot be silently promoted to complete published evidence. V8-specific profiling options are not portable to WebKit.

## Build the profile

```sh
pnpm --filter @codexo/exojs-bench bench:compare --profile \
  --rendering run-1/rendering/results.json run-2/rendering/results.json run-3/rendering/results.json \
  --physics run-1/physics/results.json run-2/physics/results.json run-3/physics/results.json
```

Follow the command's output path and validation diagnostics. Do not rename a profile to disguise a different machine or splice measurements from different runs into it. The comparison code selects the eligible loads and verdicts; the README does not define an alternative calculation.

## Understand pooling

A published timing pools per-run statistics: the reported central value is the median of the run medians, and the reported p95 is the median of the per-run p95 values. It is **not** the percentile of all raw samples concatenated together. Run spread and verdict stability remain relevant even when the pooled central values differ.

The harness's comparison bands are reporting policy, not confidence intervals or a statistical guarantee. Tail estimates need enough samples; the absence of a published p99 does not mean a sample quantile is mathematically undefined.

A row represents one declared scenario and load. The selected counts for different physics rows can differ; comparing their times does not reveal a cross-scenario capacity ranking. A time over 16.7 ms exceeds a nominal 60 Hz frame interval in that measured region alone. It is a workload warning, not a universal judgment that every application using that library is unplayable.

## Machine and browser provenance

A rendering profile identifies the available GPU/device information, OS release, browser, and engine version. A physics profile emphasizes CPU and runtime information. Normalization deliberately ignores some incidental string differences; it does not make two different devices equivalent.

Some environments withhold detailed GPU identity. A CPU-based or anonymous label cannot prove which physical GPU executed a rendering workload. Read that limitation with the profile rather than treating a filename as independent hardware verification.

Different browsers or machines are separate reference profiles. They may help reveal environment-specific behavior, but a ratio across those profiles is not a controlled browser-only or engine-only experiment. The site's selected profile and its displayed provenance must stay together.

## Integrity and history

Profile hashes bind the recorded content according to the harness policy. They can detect inconsistent or modified data, but they are not a cryptographic signature by an independent measurer and do not prove that fabricated input was actually executed. Review provenance and the acquisition procedure as well as the hash.

Preserve intentionally published historical profiles. A newer engine release does not make an old measurement invalid; it makes its version context important. Do not copy old numeric results into current product positioning as though they described the latest build.

[Harness methodology](../docs/harness.md) explains the measurement and comparison rules. [Adapter documentation](../src/rendering/adapters/README.md) explains workload equivalence. The [site](https://exoridus.github.io/ExoJS/en/benchmarks/full/) displays the generated profiles and their omissions without manufacturing an overall winner.
