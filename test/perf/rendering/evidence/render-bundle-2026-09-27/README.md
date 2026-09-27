# Native WebGPU render-bundle spike, 2026-09-27

Decision: the evidence gate is met for a static state-churn fixture, and a native per-batch prototype has a repeatable but small CPU benefit. Keep production integration deferred: this result justifies a narrowly scoped follow-up, not general native-bundle support. This establishes a measured triple-digit-batch case for future evaluation.

Measured source: `07d5ea5496381a24b82d491edf763578448574c5`. Chromium 153.0.8010.12, Windows, headless, hardware adapter reports NVIDIA / Blackwell. The browser does not expose the exact device name. Three independent browser processes, two scene sizes per process. Raw readings and adapter metadata are in [results.json](results.json). Preliminary coarse-timer runs are excluded.

## Workload and method

The existing sprite fixture uses four fixed-function blend modes in runs of 64, following the repository's mixed-blend rationale. Sprites are static, 8x8, share one texture, and are scattered within a 1280x720 view. This is a representative state-churn mechanism, not a captured game or an exact reproduction of the published mixed-blend benchmark (which has different texture and nesting settings). No per-sprite forced flushes. Observed batches, rather than node counts, determine eligibility.

The probe requires at least 100 batches, actual retained replay, and at least 0.1 ms instrumented replay time before enabling the candidate. Instrumented replay times include two timer calls per batch and are diagnostic only; the A/B measurement removes that wrapper. COOP/COEP enable finer browser timers. After 150 warmup frames and 100 diagnostic frames, each arm receives 30 settling frames and 100 measured frames per block. Eight blocks alternate AB and BA. GPU completion is awaited after every frame, outside the timed region. The measurement covers `resetStats`, clear, root rendering, and flush; it is CPU submission time, not GPU time or display FPS. This serial acquisition does not represent a saturated pipelined game loop.

The disposable Vite transform changes only the final draw-encoding section of `WebGpuSpriteRenderer.replayRetainedBatch`. One native bundle per retained payload replaces pipeline/bind-group/vertex/index/draw commands with `executeBundles`. Existing replay, resource checks, UBO upkeep, pass handling, and stats remain live. Both arms use the same transformed source and toggle a flag. Core files on disk are unchanged. The fixed static workload permits a WeakMap payload cache without implementing general invalidation.

## Results

Times are milliseconds. Baseline and bundle columns are medians of the eight block medians (upper middle for an even count). Paired saving is the median of the eight within-block differences, so it need not equal the difference between the two aggregate columns.

| Fresh process | Nodes | Batches | Baseline | Native bundle | Paired saving | Positive pairs |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 1,000 | 13 | 0.060 | Not eligible | - | - |
| 2 | 1,000 | 13 | 0.060 | Not eligible | - | - |
| 3 | 1,000 | 13 | 0.060 | Not eligible | - | - |
| 1 | 10,000 | 157 | 0.200 | 0.155 | 0.030 | 7/8 |
| 2 | 10,000 | 157 | 0.175 | 0.140 | 0.040 | 8/8 |
| 3 | 10,000 | 157 | 0.210 | 0.155 | 0.045 | 8/8 |

Instrumented replay for the 10,000-node scene: 0.204 / 0.202 / 0.358 ms per frame. These are not additive breakdowns of the uninstrumented frame times. Native bundles reduce the measured CPU frame region by approximately 20-26% when comparing aggregate arm medians, but the paired absolute saving is only 30-45 microseconds. This is not a 20-26% whole-game speedup.

All three candidate runs built exactly 157 native bundles across the measured blocks, with no subsequent rebuild. All three final baseline/candidate canvas readbacks matched byte-for-byte (0 differing bytes, 1,634,145 nonzero bytes in the baseline). WebGPU validation scopes and uncaptured-error handlers reported no errors. This is observed static-frame parity, not regression coverage of the renderer's lifecycle.

## Limits and recommendation

The prototype is throwaway and must not ship unchanged. It does not handle texture/buffer/pipeline identity changes, device loss, changing render formats, stencil, custom materials, mixed renderers, or general pass-state invalidation. It does not combine multiple batches into a single bundle, measure rebuild amortization, measure GPU cost, or validate another backend/device. Bundles can invalidate pass bindings; the tested sprite path explicitly rebinds its complete draw state, but mixed-renderer behavior needs separate proof.

Do not drop native bundles as inherently useless, and do not treat the historical 4-16 batch argument as current evidence. Defer production integration given the small absolute saving and missing lifecycle coverage. A follow-up should be driven by a real CPU-bound scene and include resource/pass invalidation, mixed-renderer parity, build-cost amortization, and a second hardware profile before accepting the maintenance cost.

## Reproduce and validation

The [archived reproducer](reproduce.md) contains the complete disposable runner, browser probe, and summary script. Run it against the measured source revision above with the existing development dependencies installed. It does not activate native bundles in the runtime or add a maintained benchmark lane. Raw timing arrays are retained so the summaries can be checked independently.

Three independent browser acquisitions exited successfully, with pixel parity and WebGPU validation as reported above. This is experimental evidence rather than a published cross-library reference profile. General lifecycle and performance regression suites are outside this static probe.
