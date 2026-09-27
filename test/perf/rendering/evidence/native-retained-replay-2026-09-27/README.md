# Integrated adaptive native replay

Status: controlled idle acquisition is positive in all nine processes. This supports the adaptive implementation on the measured hardware; it does not establish a universal production profitability threshold.

The measured source includes adaptive promotion, the mixed-layout bind-group cache, and non-destructive incompatible-pass fallback. The source revision is 854b09a95929135a4b7ee19a9be64d084a5cc9da. The normalized SHA-256 hashes in [source-manifest.json](source-manifest.json) identify the seven measured production files. The source was committed before acquisition.

## Paired CPU savings

Times are milliseconds, median of eight paired block-median differences per process. Each scene/process uses a fresh Chromium process on the same RTX 5070 Ti / NVIDIA Blackwell machine. Three processes per scene.

| Process | Sprites | Batches | Saving |
| ------- | ------- | ------: | -----: |
| 1       | 10k     |     157 |  0.010 |
| 1       | 50k     |     782 |  0.060 |
| 1       | 100k    |    1563 |  0.060 |
| 2       | 10k     |     157 |  0.025 |
| 2       | 50k     |     782 |  0.060 |
| 2       | 100k    |    1563 |  0.070 |
| 3       | 10k     |     157 |  0.030 |
| 3       | 50k     |     782 |  0.075 |
| 3       | 100k    |    1563 |  0.100 |

The 50k case saves 0.060-0.075 ms in all three processes; 100k saves 0.060-0.100 ms. The 10k case saves 0.010-0.030 ms. These integrated savings remain smaller than the eager prototype's 0.17-0.36 ms range. Identity validation and policy bookkeeping remain in the candidate; the earlier prototype numbers must not be presented as production gains.

## Method and correctness

The disposable Vite transform adds a baseline toggle immediately before native draw dispatch. Both arms retain the integrated backend frame hook, pipeline/bind-group preparation and normal resource upkeep; the baseline emits ordinary indexed commands and skips native cache draw observation. This isolates native dispatch plus its cache checks, rather than comparing separately built historical releases. Switching back to the candidate requires renewed observation; 100 settling frames per arm allow complete promotion of every tested workload before timing. All timed samples contain zero native builds.

Each arm measures 100 frames after settling, with eight alternating AB/BA blocks. Timing includes resetStats, clear, scene rendering and flush; GPU completion is awaited outside timing. It is CPU submission time in a serial acquisition, not GPU time or displayed FPS. Medians use the upper middle element for even-length arrays. The 8x8 sprite fixture, 1280x720 offscreen target, four blend modes in runs of 64, and optimizer match the scale spike.

The separate initial promotion trace confirms no construction during the first 30 observation frames and at most 32 native builds per frame. After timing, each acquisition waits through renewed promotion and requires exactly zero native executions for baseline and one execution per retained batch for each native capture before comparing synchronized RenderTexture bytes. All nine acquisitions pass with zero byte differences, nonblank clear controls, and no validation errors. [parity-results.json](parity-results.json) is a compact extraction from these same acquisitions, not another run. Promotion traces include JIT/startup noise and do not isolate incremental construction cost.

The PC was reserved for this acquisition, with no concurrent local builds or tests. This canonical dataset supersedes the earlier integrated measurements taken with uncontrolled desktop activity (50k: 0.060-0.150 ms; 100k: -0.020 to 0.075 ms), which remain in Git history. That difference does not prove desktop activity caused the earlier negative result. Excluded exploratory raw data has been removed from the final tree. No second hardware class was available. This acquisition does not measure adaptive policy under churn; reset and fallback are covered by regression tests, while the eager reconstruction/churn matrix remains separate evidence.

The candidate uses 30 completed consecutive stable replay frames, a 32-batch floor and a shared 32-build frame budget. These are internal heuristics, not a guarantee of future reuse. The earlier break-even estimate starts after construction; elapsed observation time does not amortize a bundle that has not yet been built. Incompatible stencil, depth-write, and multiple-attachment passes use ordinary replay and pause observation without discarding normal-pass bundles. Resource identity changes still invalidate on compatible replay. Representative consumer profiling and additional hardware remain follow-up work.
