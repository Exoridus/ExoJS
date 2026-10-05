# Recorded music corpus

Five CC0 excerpts complement the synthetic beat evaluation. Each file contains the first 30 seconds of its source, downmixed as `(left + right) / 2`, resampled to 48 kHz and quantized to signed 16-bit mono PCM in a canonical 44-byte-header WAV. No gain normalization, silence removal, looping, or tempo adjustment is applied. The committed files are the test inputs: CI needs neither downloads nor FFmpeg/Python dependencies.

| Fixture                | Artist                                 | Source and selected original                                                                           | Selection reason                          |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `chill-menu.wav`       | Not Jam                                | [Not Jam Music Pack](https://not-jam.itch.io/not-jam-music-pack), `ChillMenu_Loopable.wav`             | Clear percussion candidate                |
| `descend-gameplay.wav` | Not Jam                                | [Not Jam Music Pack](https://not-jam.itch.io/not-jam-music-pack), `DescendGameplay_Loopable.wav`       | Complex breakbeat candidate               |
| `vampires-piano.wav`   | TAD                                    | [Vampire's Piano](https://opengameart.org/content/vampires-piano), `vampires_piano_1.wav`              | Piano-led music                           |
| `2-jazz.wav`           | HoliznaCC0                             | [2 (jazz)](https://freemusicarchive.org/music/holiznacc0/busted-guitar-jazz/2-jazz/), FMA track 204029 | Instrumental jazz                         |
| `cave-theme.wav`       | Brandon Morris (Brandon75689 / HaelDB) | [Cave Theme](https://opengameart.org/content/cave-theme), `cave themeb4.ogg`                           | Ambient music; not assumed to be beatless |

All source pages offer CC0; Cave Theme additionally offers OGA-BY 3.0, and this corpus uses its CC0 option. The CC0 notice is in [CC0.txt](CC0.txt). Source and excerpt SHA-256 hashes, conversion settings, source links and annotation provenance are recorded in [manifest.json](manifest.json). These music files retain their CC0 dedication independently of the package's MIT software license. Loopable and standalone exports are distinct inputs; their references must not be interchanged without checking alignment.

## Reproduction

Use the exact original whose hash matches `sourceSha256`, then the FFmpeg version recorded in the manifest:

```sh
ffmpeg -nostdin -v error -i ORIGINAL -map_metadata -1 -af "pan=mono|c0=0.5*c0+0.5*c1,aresample=48000:resampler=swr:dither_method=none,atrim=start_sample=0:end_sample=1440000" -c:a pcm_s16le -fflags +bitexact EXCERPT.wav
```

The output must match `sha256`; do not silently update hashes when a source, decoder or conversion changes. Different FFmpeg builds can produce different bytes. The FMA source is MP3 and Cave Theme is OGG; converting either to WAV does not restore lost detail. WAV fixes the decoded samples so tests do not depend on browser codecs or encoder padding.

## Reference status

DescendGameplay, Vampire's Piano and 2 (jazz) have status `reviewed`: an auditory click-overlay review accepted their proposed main pulse without manually refining timestamps. ChillMenu remains `unreviewed` because its clicks mostly land between main beats, with occasional additional offsets. Cave Theme remains `unreviewed` because the clicks were too fast and its pulse convention remains unresolved; it is not a reviewed no-pulse control.

The initial proposals were independently generated with librosa; their method and version are recorded per entry. The ExoJS detector output was not used to generate them. Another detector can still choose the wrong metrical level, phase, or a pulse that is not musically meaningful. `candidateBeatTimesSec` remains a proposal, not ground truth. Auditory acceptance establishes the chosen pulse convention but does not provide sample-exact timing.

Before changing an annotation to `reviewed`, listen to the excerpt with a click overlay, choose the main perceived beat rather than every instrumental onset, and inspect the full excerpt for missed beats, fills, gaps, and tempo drift. Correct the timestamps against the audio. Record the reviewer and the beat convention in `reviewedBy` and `notes`. Use `kind: "beats"` and `beatTimesSec` for a completely annotated excerpt, or `kind: "no-pulse"` with an empty list only after confirming no meaningful pulse throughout the excerpt. Mixed or ambiguous excerpts remain unreviewed until their scope is resolved; an empty or incomplete list is not a negative control.

The harness reports `quality: null` while review is pending, including for ambient music. It does not count all emissions as false positives merely because annotations are missing. Once reviewed, it reuses the synthetic harness's fixed +/-70 ms one-to-one matcher and posting-latency bounds. Tempo reference is inferred between consecutive reviewed beats; tempo accuracy excludes times before the first and after the last reference beat. A reviewed no-pulse excerpt has no tempo score.

## Running and interpreting

From the repository root:

```sh
pnpm exec vitest run --project=exojs-audio-fx packages/exojs-audio-fx/test/beat-detector.music.test.ts packages/exojs-audio-fx/test/harness/recorded-music.test.ts
```

Set `MIR_MUSIC_REPORT_PATH` to retain the JSON report. It includes the corpus manifest, reference status, observed beat counts, first posting time, median positive tempo estimate, mean state confidence and any reviewed quality metrics. It contains no wall-clock timestamp. No ordinary run writes a tracked baseline or modifies annotations.

The current assertions verify input identity, format, reference contracts, finite analysis, render-block invariance, and preservation of locked analysis when provisional delivery is disabled. They do not assert musical accuracy. A green run is an integration/regression result, not evidence of high precision or recall. The three accepted references enable descriptive accuracy measurements; no music accuracy threshold is asserted by this initial corpus.

Initial observed values for these exact excerpts, with production defaults:

| Fixture         | Provisional beats | Locked beats | First posting (s) | Median estimated BPM |
| --------------- | ----------------: | -----------: | ----------------: | -------------------: |
| ChillMenu       |                 6 |           88 |             0.456 |               181.52 |
| DescendGameplay |                 7 |          128 |             0.403 |               274.86 |
| Vampire's Piano |                 3 |           68 |             0.851 |               143.81 |
| 2 (jazz)        |                 4 |           39 |             0.563 |                88.37 |
| Cave Theme      |                 4 |           43 |             0.723 |               175.59 |

These are observations, not correct reference tempos or latency measurements against ground truth. The accepted DescendGameplay reference is near half the detector's tempo estimate, exposing a doubled-tempo interpretation. ChillMenu phase and Cave Theme pulse selection remain unresolved. Five excerpts do not establish genre-wide generalization, vocal robustness, live-drum timing, or calibrated confidence.

## Reviewed measurements

With the accepted click-overlay references, production defaults and the fixed +/-70 ms matcher, all provisional and locked emissions together produce:

| Fixture          | Precision | Recall |    F1 | False positives | Exact-tempo accuracy | Octave-tolerant accuracy |
| ---------------- | --------: | -----: | ----: | --------------: | -------------------: | -----------------------: |
| descend-gameplay |     0.459 |  0.939 | 0.617 |              73 |                0.000 |                    0.831 |
| vampires-piano   |     1.000 |  1.000 | 1.000 |               0 |                0.882 |                    0.882 |
| 2-jazz           |     0.953 |  1.000 | 0.976 |               2 |                0.380 |                    0.380 |

These are descriptive measurements against the accepted main-pulse convention. DescendGameplay exposes doubled-tempo tracking; a high recall alone does not imply correct beat density. Timing follows the accepted candidate timestamps, not sample-exact manual labels. ChillMenu and Cave Theme deliberately have no accuracy scores until their rejected proposals are corrected and reviewed. The production detector is unchanged.
