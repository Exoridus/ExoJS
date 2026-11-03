# PixelFX transition assets

These native-resolution RGBA atlases reproduce Burn Away, Pixel Dissolve and Star Iris from [PixelFX](https://github.com/patch-gg/pixelfx) revision `a84159688af3ca37a4be05a0d422b94451b2e24e`. The source metadata in `src/fx/transitions/_lib.js` sets a 320 x 180 canvas and 30 fps. Each effect supplies its own duration and default palette/seed. No duration reduction, frame decimation, recoloring or procedural reimplementation is applied.

## Reproduce

From the repository root with Node 24.14.1:

```sh
node scripts/pixelfx-transitions/generate.ts
```

This uses only Node built-ins. It requires neither network access nor installed npm packages. The vendored source snapshots have a `.txt` suffix to distinguish unchanged third-party JavaScript from authored repository tooling; the generator restores the original filenames in a uniquely named OS temporary directory, imports them as ESM, and removes that directory on completion. The complete upstream core is retained because the effect modules import its barrel, which re-exports the core modules. No gallery assets are used.

The generator follows upstream `tools/lib/fxlib.mjs:renderFrames`: samples include both endpoints, with `round(duration * fps) + 1` source frames; `createFx` advances each 1/30 s step in four 1/120 s simulation substeps. `composite(frame, ..., null)` supplies straight-alpha RGBA directly. Rows are copied without alpha multiplication, padding or bleed. This avoids the upstream sprite-sheet canvas helper's multiplication of RGB while pasting onto transparency. The upstream dependency-free PNG encoder uses the Sub filter and zlib level 9. Native pixel bytes are deterministic; exact compressed bytes are verified on Node 24.14.1, zlib `1.3.1-e00f703`. A different Node/zlib implementation may produce a different valid PNG stream.

```sh
node scripts/pixelfx-transitions/generate.ts --check
pnpm exec vitest run --config scripts/pixelfx-transitions/vitest.config.ts test/scripts/pixelfx-transitions.test.ts
```

`--check` regenerates and compares SHA-256 for the manifest, PNG atlases, measurements and contact sheets without rewriting them. The small test config avoids requiring unrelated built engine/tooling packages. The named test also runs in the repository `exojs` project once its tooling prerequisites are built.

## Timing, size and cover proof

| Effect         | Upstream duration | Source frames | Atlas frames | Playback seconds | Atlas dimensions | PNG bytes | Frame RGBA bytes | Atlas GPU bytes | Opaque cover frames |
| -------------- | ----------------: | ------------: | -----------: | ---------------: | ---------------- | --------: | ---------------: | --------------: | ------------------- |
| Burn Away      |             3.0 s |            91 |           92 |       3.066667 s | 2560 x 2160      | 2,545,545 |       21,196,800 |      22,118,400 | 37..54              |
| Pixel Dissolve |             2.2 s |            67 |           67 |       2.233333 s | 2240 x 1800      | 2,654,070 |       15,436,800 |      16,128,000 | 26..35              |
| Star Iris      |             2.2 s |            67 |           67 |       2.233333 s | 2240 x 1800      |   419,655 |       15,436,800 |      16,128,000 | 26..39              |

Frame RGBA bytes = `320 * 180 * 4 * frameCount`. Actual GPU bytes include unused trailing atlas cells: `atlasWidth * atlasHeight * 4`, without mipmaps or driver overhead. All dimensions are below 4096. Together the three PNGs occupy 5,619,270 bytes; the three decoded atlas textures occupy 54,374,400 bytes (51.86 MiB). Loading only the selected effect would bound resident atlas data to 21.09 MiB. The current Playground example instead eagerly loads all three atlases together at startup for immediate switching, so its three atlas textures occupy 51.86 MiB of decoded GPU storage (excluding driver overhead). This is a prototype trade-off, not a measured runtime performance requirement; lazy loading is a possible later optimization. Runtime memory and GPU timing have not been benchmarked.

Playback seconds assumes every frame, including the terminal transparent frame, is displayed for 1/30 s and excludes any consumer scene-commit hold. First-to-last frame timestamps span 3.033333 s, 2.2 s and 2.2 s respectively. Upstream's inclusive final sample already adds one frame interval if encoded this way. Burn Away's upstream time-zero image has 8,437 pixels with nonzero alpha from its initial edge glow. One transparent frame is prepended, preserving all 91 original samples and adding another 1/30 s. Other effects need no endpoint adjustment. No trailing frame is added. Optional manifest fields `sourceDuration`, `sourceFrameCount`, `preludeFrames` and `postludeFrames` describe this explicitly; all required schema-1 fields are unchanged.

`measurements.json` records every frame's count of nonzero-alpha pixels, count of alpha-255 pixels and sum of byte alpha. Frame 0 and the last frame have zero nonzero-alpha pixels for every effect. Every frame inside the declared cover interval has exactly 57,600 alpha-255 pixels; no frame outside it is fully opaque. The tests decode the actual PNGs and verify these counts, dimensions and hashes. Dividing `alphaSum` by `57,600 * 255` gives mean alpha coverage; this includes light and smoke, rather than only the opaque silhouette.

| Frame | Burn Away coverage | Pixel Dissolve coverage | Star Iris coverage |
| ----: | -----------------: | ----------------------: | -----------------: |
|     0 |              0.00% |                   0.00% |              0.00% |
|     6 |              0.95% |                  13.86% |              0.10% |
|    12 |              9.60% |                  38.59% |             16.21% |
|    18 |             43.35% |                  67.02% |             85.43% |
|    24 |             75.03% |                  96.22% |             99.94% |
|    30 |             95.14% |                 100.00% |            100.00% |
|    36 |             99.98% |                  96.32% |            100.00% |
|    42 |            100.00% |                  64.11% |             99.46% |
|    48 |            100.00% |                  38.28% |             23.49% |
|    54 |            100.00% |                  16.37% |              0.11% |
|    60 |             75.71% |                   1.52% |              0.00% |
|    66 |             13.04% |                   0.00% |              0.00% |
|  Last |              0.00% |                   0.00% |              0.00% |

## Representation comparison

| Approach                              | Measured size or cost                                                                                                                     | Fidelity and runtime trade-off                                                                                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full RGBA atlas (chosen)              | 54,374,400 decoded bytes total; 5,619,270 PNG bytes                                                                                       | Lossless upstream transparent samples, one ordinary texture lookup, no custom decoding or engine changes. All atlases fit 4096. This is the smallest complete implementation compatible with the ordinary sprite-atlas contract.                                            |
| Palette index + RGBA LUT              | Exact RGBA colors: 60,944 / 21,797 / 11,246. Two-byte indices plus LUT payloads: 10,842,176 / 7,805,588 / 7,763,384 bytes before packing  | Roughly halves GPU payload with integer/two-channel index textures and a palette lookup. An 8-bit index cannot represent these palettes losslessly; quantization would alter glow and smoke. Requires a specialized renderer and different asset contract.                  |
| Alpha-only + color LUT                | One byte per pixel would use 5,299,200 / 3,859,200 / 3,859,200 bytes before LUTs and packing                                              | Alpha is not a unique color index: flames, ink, rims, particles and glows can have the same alpha and different RGB. A single alpha/LUT cannot preserve the look. More channels or a full index scheme are required.                                                        |
| Identical-frame deduplication         | Unique complete frames: 90 / 63 / 54, versus 92 / 67 / 67 stored frames                                                                   | Can preserve timing with an indirection/timing table, but offers little for Burn Away and Pixel Dissolve. Opaque cover frames still animate glints, embers and cracks; collapsing all cover frames changes their look. Requires consumer changes to preserve sample timing. |
| Run-length RGBA                       | Estimated uncompressed run payload, four-byte color + four-byte length: 10,044,168 / 9,563,008 / 2,249,992 bytes, excluding frame offsets | Lossless, especially good for Star Iris, but PNG already compresses spatial runs. CPU decoding to full atlases saves no GPU memory; streaming decoded frames adds per-frame upload and synchronization cost. No runtime RLE decoder was built.                              |
| Procedural shader or Graphics overlay | No full animation texture, but substantial shader/geometry and state code                                                                 | Requires porting scanline fills, seeded fields, particle simulations, ordered dithering, smoke blending and additive lights. No measured runtime advantage; backend parity and matching all frames would need separate proof. Greatest implementation and fidelity risk.    |
| Hybrid silhouette + particles/light   | A mask could use one byte per pixel, plus colored detail textures or procedural work                                                      | Could retain additive light separately and reduce opaque data, but needs multiple passes/textures, synchronization and a new contract. Savings depend on actual layer packing and were not measured.                                                                        |

Recommendation: keep full RGBA atlases for this small opt-in demo. The current Playground preloads all three textures; evaluate loading only the selected effect if memory measurements justify that change. A future memory-constrained deployment should evaluate a lossless two-byte index/LUT or a separate additive-light layer before reducing temporal fidelity. No reduced-data or procedural runtime has been implemented.

## Visual and source verification

The three `*-contact.png` files show 12 evenly spaced output frames composited with ordinary straight-alpha blending over the upstream sky backdrop. Labels are atlas frame index and playback timestamp. They were inspected against independent contact sheets rendered with the pinned upstream `loadEffect`, `renderFrames` and `contactSheet` tools, covering close, cover, open and residual particles. The entire sequence of source RGBA samples, excluding Burn Away's added empty frame, also matches the independently rendered upstream sequences byte-for-byte; their SHA-256 hashes are asserted in the test.

The live gallery browser was unavailable during verification; the pinned renderer was the visual reference. Pixel shapes, palettes, durations, particles and fades are preserved. One straight-alpha overlay cannot reproduce additive light over every possible background exactly: upstream `composite(..., null)` explicitly bakes light into alpha, which reads closest to additive over dark backgrounds. This is the upstream transparent-output limitation, visible as some background attenuation around glow over brighter scenes. Preserving separate light data would require the hybrid contract above. Contact sheets use the actual baked RGBA blend to show that limitation honestly.

## Licensing

`LICENSE` retains the upstream MIT license and Patch/Hugo Duprez copyright notices. `NOTICE.md` retains upstream notices and documents the vendored subset, including Sprite Fusion fire/sparkle/VFX and Hollow Crown adaptations. Original source headers remain intact. `examples/assets/licenses/pixelfx.txt` accompanies the generated assets using the existing asset-license directory convention. No `gallery/fonts` files or other gallery assets are copied; the core's MIT bitmap glyphs only label tool contact sheets.
