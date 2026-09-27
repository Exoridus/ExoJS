# Synthetic beat evaluation

The MIR harness evaluates the production beat worklet with reproducible mono PCM and annotated beat times. It reuses `test/harness/beat-sandbox.ts`, `test/harness/beat-metrics.ts`, and `test/fixtures/beat-fixtures.ts`. No audio download, external dataset, network connection, or detector tuning is required.

From the repository root:

```sh
pnpm exec vitest run --project=exojs-audio-fx packages/exojs-audio-fx/test/beat-detector.mir.test.ts
pnpm exec vitest run --project=exojs-audio-fx packages/exojs-audio-fx/test/harness/beat-mir.test.ts packages/exojs-audio-fx/test/fixtures/beat-adversarial.test.ts
```

To retain the complete machine-readable measurements in PowerShell, set an output path before running the first command:

```powershell
$env:MIR_REPORT_PATH = Join-Path $env:TEMP 'exojs-beat-mir.json'
```

The optional JSON report contains `schemaVersion`, sample rate, render-block size, match tolerance, and per-fixture `default` and `lockedOnly` metrics. It has no wall-clock timestamp or timing benchmark, so identical input and detector behavior produce an identical report. An ordinary test run does not write a baseline or modify tracked files. The named tests are included by the existing `exojs-audio-fx` unit-test project; no separate CI service is required.

## Metric contracts

- Beat quality uses a fixed +/-70 ms timestamp tolerance. Matching maximizes the number of one-to-one pairs, then minimizes their total absolute timestamp error. Duplicate emissions count as false positives. This score is separate from the older benchmark's half-inter-beat-interval window, which permits +/-250 ms at 120 BPM.
- Precision is matched/emitted; recall is matched/reference; F1 is `2 * matched / (emitted + reference)`. Missing denominators are `null`, not perfect scores. An empty prediction against nonempty annotations has F1 zero. Negative controls retain false-positive counts and rates even when recall is undefined.
- Timestamp error reports signed mean, mean absolute error, and p90 absolute error for matched pairs. Posting latency instead subtracts the annotated beat time from the sandbox block in which `postMessage` occurred. Median and p90 have lower and upper bounds separated by one render block (2.667 ms at 48 kHz and 128 samples). Backdated timestamps therefore cannot conceal posting delay. Negative values describe advance predictions and are preserved. Quantiles use sorted index `floor(p * n)`, capped at the final index.
- Timing distributions cover matched pairs only. Read them together with precision, recall, and match counts: rejecting difficult events can otherwise make latency look better. `firstPostedSec` includes unmatched beats and is relative to fixture start, so it is a startup diagnostic, not necessarily a correct onset response.
- `all`, `provisional`, and `locked` are scored independently against the entire reference sequence. Substream recall includes startup misses; their matched counts must not be added together. No warmup interval is discarded.
- Tempo accuracy is the fraction of state messages within 3% of the fixture's instantaneous tempo. An unestimated tempo counts as incorrect. Octave-tolerant accuracy also accepts half and double tempo and is a separate diagnostic, never a substitute for exact-tempo accuracy. Nonrhythmic controls have no tempo score.

The additional contract test checks a context starting at 100 seconds and 256-sample render blocks. Context-relative beat timestamps are converted to fixture-relative time before matching, while sandbox posting times are already fixture-relative.

## Reproducible signals and observed results

All signals below last 12 seconds at 48 kHz, with production defaults (`fftSize: 2048`, `hopSize: 512`, provisional emission enabled). The comparison changes only `emitProvisionalBeats` to `false`. The test asserts identical state messages and identical locked beat messages between these runs. Provisional downbeat `barStart` messages are also suppressed by that option and are not part of this comparison.

The added adversarial fixtures delay the existing 120 BPM clicktrack by 1.137 seconds, attenuate that delayed signal by 40 dB without renormalization, remove beats and samples between 4 and 6 seconds, add 0.65-amplitude offbeat noise bursts, and provide silence, a sustained 440 Hz tone, and seeded stationary noise as negative controls. Seeds, amplitude, timing, and annotations are fixed. Existing kit, swing, slow-attack, and tempo-ramp generators provide additional coverage. Ground truth marks intended main beats; distractors and silent gaps are deliberately unannotated.

These measurements characterize the existing detector; the table is not a claim of accuracy on recorded music:

| Signal               | Precision | Recall |    F1 | False positives | First beat / locked-only (s) | Provisional / locked posting p90 upper (ms) |
| -------------------- | --------: | -----: | ----: | --------------: | ---------------------------: | ------------------------------------------: |
| 120 BPM clicks       |     0.958 |  0.958 | 0.958 |               1 |                0.563 / 2.003 |                                216.0 / 13.3 |
| 180 BPM kit          |     0.972 |  0.972 | 0.972 |               1 |                0.403 / 1.672 |                                216.0 / 10.7 |
| 120 to 150 BPM ramp  |     0.500 |  0.481 | 0.491 |              13 |                0.563 / 1.971 |                                221.2 / 13.4 |
| 90 BPM slow attack   |     1.000 |  0.944 | 0.971 |               0 |                0.723 / 2.675 |                                 58.7 / 16.0 |
| 120 BPM swing        |     0.917 |  0.917 | 0.917 |               2 |                0.403 / 2.131 |                               216.0 / 149.3 |
| Delayed clicks       |     0.952 |  1.000 | 0.976 |               1 |                1.203 / 2.643 |                                 68.3 / 13.7 |
| Quiet delayed clicks |     0.952 |  1.000 | 0.976 |               1 |                1.203 / 2.643 |                                 68.3 / 17.7 |
| Missing beats        |     0.905 |  0.950 | 0.927 |               2 |                0.563 / 2.003 |                                216.0 / 12.0 |
| Offbeat distractors  |     0.489 |  0.958 | 0.648 |              24 |                0.403 / 1.757 |                                 13.3 / 13.3 |
| Silence              |       n/a |    n/a |   n/a |               0 |                          n/a |                                         n/a |
| Sustained tone       |       n/a |    n/a |   n/a |               0 |                          n/a |                                         n/a |
| Seeded noise         |     0.000 |    n/a | 0.000 |              10 |                6.952 / 7.923 |                                         n/a |

The tempo ramp has exact-tempo accuracy 0.147. The offbeat distractor signal has exact-tempo accuracy zero but octave-tolerant accuracy 0.862, exposing a doubled-tempo interpretation. Noise produces 50 false positives per minute. These are known quality limitations retained in the report, not passing quality claims or fixtures adjusted to suit the detector.

Quality assertions require precision above 0.9 and recall above 0.8 on clicks, the kit, slow attacks, and delayed/quiet clicks, together with improved first delivery and F1 relative to locked-only output. Silence and sustained tone must emit no beats. Delayed and quiet clicks additionally require first delivery within 75 ms of the first annotated onset, including the render-block upper bound. This absolute limit catches a slowdown shared by both provisional and locked output.

Hard-case regression guards preserve the current measured capability with conservative bounds: ramp F1 at least 0.45, swing and missing-beat F1 at least 0.90, offbeat-distractor precision at least 0.45 with at most 24 false positives, and seeded noise at most 10 false positives per 12-second fixture. These bounds retain the known weaknesses; they prevent further degradation without treating present quality as a release-wide accuracy target. All cases also check preservation of the locked path. The report retains full measurements rather than an exact floating-point snapshot. Metric contracts are tested with analytically constructed logs, including duplicates, competing matches, missing estimates, late contexts, and backdated timestamps.

## Low-latency decision and limits

The existing provisional path improves first delivery by 1.440 seconds on 120 BPM clicks and 1.269 seconds on the 180 BPM kit. Whole-sequence F1 improves from 0.909 to 0.958 and from 0.925 to 0.972 respectively. For delayed clicks, the first output arrives within a 65.7 to 68.3 ms audio-block interval after the first annotated onset. This supports using provisional beats for early visual feedback, subject to their weaker trust level.

A separate low-latency onset path is deferred. This evaluation establishes an existing startup benefit but does not demonstrate an incremental benefit from another detector, and provisional beats still have substantial posting delay and false positives on some inputs. No onset API, detector algorithm, threshold, or worklet option is changed by the harness. Any future candidate should be compared against these unchanged fixtures and a broader independently annotated music corpus before expanding the public API.

The sandbox measures deterministic algorithm behavior, not main-thread message delivery, speaker latency, animation-frame alignment, browser scheduling, CPU cost, or real-time deadline reliability. It covers one sample rate and synthetic mono signals. The kit is a simplified synthesis, swing annotations reflect an explicit beat convention, and ramp beat positions use the existing generator's forward-step approximation. Results do not establish music-genre generalization, calibrated confidence, downbeat accuracy, or rhythm-game scoring suitability.
