# PixelFX asset pipeline result

Implementation commit: `7680d4c574c505f4a07114b2cba7fefa3b7fa331` - feat(examples): add reproducible PixelFX transition atlases. This report is committed separately afterward. No push, PR or merge was performed. No `-o` destination was supplied, so this report uses `tools/pixelfx-transitions/RESULT.md`.

## Delivered

Three native 320 x 180, 30 fps straight-alpha RGBA atlases, the schema-1 manifest, an offline Node-only generator, 20 unchanged upstream source snapshots, attribution, contact sheets, per-frame coverage measurements and five focused tests. All source samples match independent pinned-upstream renders byte-for-byte. The snapshots also match their upstream Git blobs at revision `a84159688af3ca37a4be05a0d422b94451b2e24e`.

| Effect         | Upstream seconds | Source frames | Delivered frames | Playback seconds | PNG bytes | Frame RGBA bytes | Atlas dimensions | Atlas GPU bytes | Opaque cover |
| -------------- | ---------------: | ------------: | ---------------: | ---------------: | --------: | ---------------: | ---------------- | --------------: | ------------ |
| Burn Away      |              3.0 |            91 |               92 |         3.066667 | 2,545,545 |       21,196,800 | 2560 x 2160      |      22,118,400 | 37..54       |
| Pixel Dissolve |              2.2 |            67 |               67 |         2.233333 | 2,654,070 |       15,436,800 | 2240 x 1800      |      16,128,000 | 26..35       |
| Star Iris      |              2.2 |            67 |               67 |         2.233333 |   419,655 |       15,436,800 | 2240 x 1800      |      16,128,000 | 26..39       |

Playback seconds means every frame displayed for 1/30 s, including the final transparent frame, excluding an asynchronous scene-commit hold. First-to-last timestamps span 3.033333 / 2.2 / 2.2 s. Upstream exports include both endpoints. Burn Away additionally needs one prepended transparent frame because its original time-zero image has 8,437 pixels with nonzero alpha. All original samples remain intact; no temporal decimation or cover deduplication was applied. Every delivered first/last frame is transparent, and every declared cover frame is alpha 255 at all 57,600 pixels. The complete coverage curves are in `measurements.json` and summarized in `README.md`.

All atlases fit the 4096 limit. Total PNG size is 5,619,270 bytes; decoded atlas allocation is 54,374,400 bytes (51.86 MiB), excluding mipmaps/driver overhead. Frame RGBA byte counts exclude atlas padding; atlas GPU bytes include it.

## Representation and contract

Full RGBA atlases preserve the upstream transparent output and require ordinary nearest-filtered atlas playback. Offline vendoring avoids network and revision drift. Reproduce with `node scripts/pixelfx-transitions/generate.ts`; no new dependency or package script is needed. Node 24.14.1 / zlib 1.3.1-e00f703 was used.

Alternatives evaluated in detail in `README.md`: lossless two-byte palette indices plus LUT roughly halve GPU payload but require specialized sampling; an eight-bit palette or alpha-only LUT cannot reproduce the measured colors; identical-frame deduplication yields 90/63/54 unique frames and needs timing indirection; RGBA run-length payloads estimate 10,044,168 / 9,563,008 / 2,249,992 bytes but need decoding/upload work; procedural shader/Graphics and hybrid mask/light/particle representations add unmeasured runtime and parity work. Full RGBA is recommended for this small demo; load the selected effect as needed to limit resident data.

No required manifest field was renamed or removed. Only optional fields were added: `sourceDuration`, `sourceFrameCount`, `preludeFrames`, `postludeFrames`. No multi-atlas schema extension is necessary. The disclosed inclusive-endpoint playback interval and Burn Away's transparent prelude are the only timing differences from nominal source duration.

## Licensing and visual verification

The upstream MIT LICENSE, Patch/Hugo Duprez copyrights and original source headers are preserved. NOTICE includes Sprite Fusion fire/sparkle/core VFX and the retained Hollow Crown core adaptation (Copyright (c) 2026 rehan-remade). The existing asset-license convention is followed with `examples/assets/licenses/pixelfx.txt`. The proprietary gallery font is neither copied nor used; contact labels use the MIT core bitmap font.

Viewed all three generated contact PNGs and independently generated upstream contact sheets at 12 timestamps each, including close, cover, opening and residual particles. The live gallery browser was unavailable, so the pinned upstream renderer supplied the visual reference. Atlas source-sample hashes equal upstream output, and tests assert these independently captured hashes.

## Validation

| Command/check                                                                                                                                                                                                              | Result                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node scripts/pixelfx-transitions/generate.ts`                                                                                                                                                                             | PASS; generated all assets, asserted endpoints/opaque cover/dimensions. Initial unadjusted Burn Away endpoint assertion failed, correctly exposing its initial glow; fixed by preserving it after a transparent prelude. |
| `pnpm exec vitest run --project=exojs test/scripts/pixelfx-transitions.test.ts`                                                                                                                                            | BLOCKED at config startup: missing built `@codexo/exojs-build` entry. No tests ran through this config.                                                                                                                  |
| `pnpm exec vitest run --config scripts/pixelfx-transitions/vitest.config.ts test/scripts/pixelfx-transitions.test.ts`                                                                                                      | PASS, 1 named file / 5 tests, including deterministic full regeneration hash equality.                                                                                                                                   |
| Same isolated test command with `-t "burn-away has"`, temporarily changing coverStart from 37 to 38                                                                                                                        | EXPECTED FAIL (negative control: expected true to be false); original manifest restored, then all five tests passed.                                                                                                     |
| `pnpm typecheck:scripts`                                                                                                                                                                                                   | PASS after correcting the new covers array annotation.                                                                                                                                                                   |
| `pnpm exec tsc --ignoreConfig --noEmit --target esnext --module nodenext --skipLibCheck --strict --types 'node,vitest/globals' test/scripts/pixelfx-transitions.test.ts`                                                   | PASS.                                                                                                                                                                                                                    |
| `pnpm exec eslint scripts/pixelfx-transitions/*.ts test/scripts/pixelfx-transitions.test.ts --max-warnings=0`                                                                                                              | PASS after fixing a blank-line finding.                                                                                                                                                                                  |
| `pnpm exec prettier --check scripts/pixelfx-transitions/*.ts test/scripts/pixelfx-transitions.test.ts tools/pixelfx-transitions/README.md tools/pixelfx-transitions/NOTICE.md tools/pixelfx-transitions/measurements.json` | PASS after formatting the README table.                                                                                                                                                                                  |
| Pinned Git-blob comparison of all vendored snapshots                                                                                                                                                                       | PASS, 20/20.                                                                                                                                                                                                             |
| `git diff --check`, `git diff --cached --check`, local commit hooks                                                                                                                                                        | PASS.                                                                                                                                                                                                                    |

## Limitations

No demo integration, browser playback, GPU performance benchmark or full-repository gate was run; these are outside this asset-only scope. No unrelated tooling build was created to satisfy the root Vitest prerequisite. Exact compressed PNG hashes may differ under another Node/zlib version. A baked straight-alpha glow cannot exactly reproduce additive light on every background; this is the upstream transparent-output limitation and is documented with the hybrid alternative. Keep the 51.86 MiB combined decoded texture cost in mind.

## Exact file list

The implementation commit adds these 35 files; the report-only commit adds `tools/pixelfx-transitions/RESULT.md`:

- `examples/assets/licenses/pixelfx.txt`
- `examples/assets/pixelfx-transitions/burn-away.png`
- `examples/assets/pixelfx-transitions/manifest.json`
- `examples/assets/pixelfx-transitions/pixel-dissolve.png`
- `examples/assets/pixelfx-transitions/star-iris.png`
- `scripts/pixelfx-transitions/generate.ts`
- `scripts/pixelfx-transitions/vitest.config.ts`
- `test/scripts/pixelfx-transitions.test.ts`
- `tools/pixelfx-transitions/LICENSE`
- `tools/pixelfx-transitions/NOTICE.md`
- `tools/pixelfx-transitions/README.md`
- `tools/pixelfx-transitions/burn-away-contact.png`
- `tools/pixelfx-transitions/measurements.json`
- `tools/pixelfx-transitions/pixel-dissolve-contact.png`
- `tools/pixelfx-transitions/star-iris-contact.png`
- `tools/pixelfx-transitions/upstream/src/core/act.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/actor.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/chain.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/color.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/font.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/fx.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/index.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/math.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/painter.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/particles.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/poses.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/rig.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/scene.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/shapes.js.txt`
- `tools/pixelfx-transitions/upstream/src/core/sim.js.txt`
- `tools/pixelfx-transitions/upstream/src/fx/transitions/_lib.js.txt`
- `tools/pixelfx-transitions/upstream/src/fx/transitions/burn-away.js.txt`
- `tools/pixelfx-transitions/upstream/src/fx/transitions/pixel-dissolve.js.txt`
- `tools/pixelfx-transitions/upstream/src/fx/transitions/star-iris.js.txt`
- `tools/pixelfx-transitions/upstream/tools/lib/png.mjs.txt`
