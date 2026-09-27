# Integrated adaptive native replay

Status: implementation candidate for review. Static CPU benefit is workload-dependent even on the measured GPU; the 100k case includes a negative process result. This does not establish a universal production profitability threshold.

The measured source includes the adaptive implementation and mixed-layout bind-group cache. The base revision is 07d5ea5496381a24b82d491edf763578448574c5; the normalized SHA-256 hashes in [source-manifest.json](source-manifest.json) identify the seven measured production files, including the then-uncommitted cache class. The historical base commit/tree metadata in the runner output alone does not identify this modified source.

## Paired CPU savings

Times are milliseconds, median of eight paired block-median differences per process. Each scene/process uses a fresh Chromium process on the same RTX 5070 Ti / NVIDIA Blackwell machine. Three processes per scene.

| Process | Sprites | Batches | Saving |
| ------- | ------- | ------: | -----: |
| 1       | 10k     |     157 |  0.005 |
| 1       | 50k     |     782 |  0.090 |
| 1       | 100k    |    1563 |  0.065 |
| 2       | 10k     |     157 |  0.030 |
| 2       | 50k     |     782 |  0.150 |
| 2       | 100k    |    1563 | -0.020 |
| 3       | 10k     |     157 |  0.015 |
| 3       | 50k     |     782 |  0.060 |
| 3       | 100k    |    1563 |  0.075 |

The 50k case saves 0.060-0.150 ms in all three processes; 100k ranges from -0.020 to 0.075 ms. These integrated savings are smaller than the eager prototype's 0.17-0.36 ms range. Identity validation and policy bookkeeping remain in the candidate; the earlier prototype numbers must not be presented as production gains.

## Method and correctness

The disposable Vite transform adds a baseline toggle immediately before native draw dispatch. Both arms retain the integrated backend frame hook, pipeline/bind-group preparation and normal resource upkeep; the baseline emits ordinary indexed commands and skips native cache draw observation. This isolates native dispatch plus its cache checks, rather than comparing separately built historical releases. Switching back to the candidate requires renewed observation; 100 settling frames per arm allow complete promotion of every tested workload before timing. All timed samples contain zero native builds.

Each arm measures 100 frames after settling, with eight alternating AB/BA blocks. Timing includes resetStats, clear, scene rendering and flush; GPU completion is awaited outside timing. It is CPU submission time in a serial acquisition, not GPU time or displayed FPS. Medians use the upper middle element for even-length arrays. The 8x8 sprite fixture, 1280x720 offscreen target, four blend modes in runs of 64, and optimizer match the scale spike.

The separate initial promotion trace confirms no construction during the first 30 observation frames and at most 32 native builds per frame. All nine timing acquisitions report no WebGPU validation errors and nonblank clear controls. Their historical parity fields were captured immediately after toggling away from baseline, before renewed promotion, and therefore compare ordinary replay images. They are preserved as acquired and are not native parity evidence. A separate [parity-results.json](parity-results.json) acquisition waits through renewed promotion and requires exactly zero native executions for baseline and one execution per retained batch for each native capture before comparing synchronized RenderTexture bytes. All nine corrected parity acquisitions pass with zero byte differences and no validation errors. These traces include JIT/startup noise and do not isolate incremental construction cost.

An earlier exploratory acquisition is retained as [exploratory-results.json](exploratory-results.json). It preceded the mixed-layout cache fix and overlapped some targeted tests; it is excluded from the final table. The final [results.json](results.json) acquisition ran after the fix without concurrent test/gate jobs. No second hardware class was available. This acquisition does not measure adaptive policy under churn; reset and fallback are covered by regression tests, while the eager reconstruction/churn matrix remains separate evidence.

The candidate uses 30 completed consecutive stable replay frames, a 32-batch floor and a shared 32-build frame budget. These are internal heuristics, not a guarantee of future reuse. The earlier break-even estimate starts after construction; elapsed observation time does not amortize a bundle that has not yet been built. Keep this implementation under review pending representative consumer profiling.
