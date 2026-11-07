# Pixel VFX authoring proof of concept

Six original, palette-limited effects are authored as editable Pixelbolt JSON and played through ExoJS's existing `AsepriteSheet`, `AnimatedSprite`, and `ParticleSystem` APIs. Pixelbolt is an external authoring tool. It is never imported by Core, the example, or the published demo-assets package.

## Build and inspect

Use this repository's Node 24 and pnpm toolchain. Install the repository dependencies with `pnpm install --frozen-lockfile --ignore-scripts`, then run:

```sh
pnpm assets:pixel-vfx:setup
pnpm assets:pixel-vfx
pnpm assets:pixel-vfx:check
```

Setup installs the exact Git commit recorded in `toolchain.json` in an isolated checkout. It verifies the revision, package version, license, clean tracked state, and upstream schema hash; it refuses to overwrite a different or modified checkout. Pixelbolt itself requires no dependency installation. Subsequent builds work without a network connection.

The build validates the sources, runs Pixelbolt's own semantic validation, renders each effect twice in independent processes, compares every exported filename and byte, checks decoded pixels and atlas metadata, and publishes only the required PNG and compact JSON. `--check` repeats these operations and fails if the committed assets differ. It does not update those assets. A fresh run directory retains the full exports and evidence under `.workspace/pixel-vfx/`.

For one effect:

```sh
pnpm assets:pixel-vfx --effect mechanical-sparks
pnpm assets:pixel-vfx:check --effect mechanical-sparks
node .workspace/tools/pixelbolt/bin/pixelbolt.js preview tools/pixel-vfx/recipes/mechanical-sparks.pixel.json
node .workspace/tools/pixelbolt/bin/pixelbolt.js inspect tools/pixel-vfx/recipes/mechanical-sparks.pixel.json --out .workspace/mechanical-sparks-review.png --scale 2 --native --diagnostics
```

Replace `mechanical-sparks` with any identifier in the table below. The Pixelbolt studio edits the same JSON source. The CLI also supports frame PNGs, APNG, GIF, numbered video sequences, and native preview bundles; those extra exports remain working files and are not shipped with ExoJS. Preserve the source recipe when editing. The checked-in recipes, rather than an image or an unpublished construction script, are authoritative.

Scripts can also be invoked as `node --import tsx scripts/pixel-vfx/setup.ts` and `node --import tsx scripts/pixel-vfx/build.ts [options]`. This runs the same code without the `tsx` CLI's IPC server, which may be unavailable in restricted environments. `--tool-dir` selects another clean pinned checkout; the build also accepts `--scratch-dir` for temporary outputs.

## The effects

| Identifier          | Native frame | Frames | Clip duration | Default repeat | Intended use                                                      |
| ------------------- | ------------ | -----: | ------------: | -------------- | ----------------------------------------------------------------- |
| `mechanical-sparks` | 32 x 32      |     12 |        755 ms | Once           | A brief brass-colored tool or mechanism discharge                 |
| `ground-dust`       | 64 x 64      |     12 |        840 ms | Once           | A low, outward-moving landing or sprint puff                      |
| `impact-burst`      | 32 x 32      |     10 |        630 ms | Once           | A physical hit with a short bright contact pose                   |
| `workshop-smoke`    | 32 x 32      |     16 |       1360 ms | Loop           | A small continuous smoke plume                                    |
| `relic-activation`  | 64 x 64      |     16 |       1470 ms | Once           | A restrained petrol-colored activation with a faceted light motif |
| `energy-discharge`  | 64 x 64      |     12 |        810 ms | Once           | An angular mechanical-magical impulse with a cooling tail         |

The palette is original: warm brass and cream, muted earth colors, grey-green smoke, and restrained petrol accents. These are discrete native pixel grids with intentional clusters and integer coordinates. No high-resolution illustration is downscaled. There is no random seed or unseeded simulation in these particular recipes: the authored frames are explicit. The renderer and source bytes determine the result.

All visible pixels use the shared palette and fully opaque alpha; the background is fully transparent. Each native frame has two transparent border pixels and the atlas has two-pixel gutters. One-shots finish on transparent frames. Smoke uses a periodic sequence without an extra duplicate endpoint. The dust's two terminal transparent holds are intentional, preserving its quiet recovery period. Isolated sparks and debris are intentional; an isolated-pixel diagnostic is a review aid, not an instruction to erase them.

Art review identified overly solid, individually shaded smoke and dust masses in the first draft. Smoke was revised to a connected, irregular plume; dust was flattened, given a shared early ground silhouette, and broken into open wisps during dissipation. Contact sheets were inspected at native size and integer magnification. Browser playback, scene-background contrast, and platform-specific sampling remain separate checks from this source inspection. These assets are a first original art direction for evaluation, not a claim that procedural generation removes the need for a technical artist.

## Source and generated files

| Location                                                       | Ownership and distribution                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/pixel-vfx/recipes/*.pixel.json`                         | Authored, editable sources; committed                                                                                                       |
| `tools/pixel-vfx/palette.json`                                 | Shared authored colors; committed                                                                                                           |
| `tools/pixel-vfx/toolchain.json`                               | Pixelbolt version, immutable commit, schema checksum; committed                                                                             |
| `tools/pixel-vfx/pixelbolt.schema.json`                        | Byte-for-byte upstream schema; committed with its MIT notice                                                                                |
| `scripts/pixel-vfx/*.ts`                                       | Repository build tools and validation; committed, never runtime imports                                                                     |
| `examples/assets/images/pixel-vfx-*.png`                       | Generated native atlas textures; committed and shipped as optional demo media                                                               |
| `examples/assets/images/pixel-vfx-*.json`                      | Generated compact Aseprite-compatible metadata; committed and shipped with the textures                                                     |
| `packages/exojs-demo-assets/catalog.json`                      | Authored descriptors and provenance records                                                                                                 |
| Demo-assets generated catalog, manifest, notices, and `media/` | Derived by the existing demo-assets generator; `media/` is assembled for packaging                                                          |
| `.workspace/pixel-vfx/`                                        | Temporary complete Pixelbolt bundles, individual frame PNGs, APNGs, previews, comparisons, and validation reports; not committed or shipped |

After changing the recipe outputs, regenerate the existing media catalog and its hashes:

```sh
pnpm --filter @codexo/exojs-demo-assets generate
pnpm --filter @codexo/exojs-examples examples:sync
```

The separate `@codexo/exojs-demo-assets/pixel-vfx` entry point exports `pixelVfxAssets`. The root `demoAssets` module does not contain these texture URLs, so a bundler importing the standard catalog does not automatically emit the new effects. The files are still present in the optional demo-assets package and its standard copy manifest; installing or copying that entire content package includes them. Importing a descriptor loads nothing until a loader claims it.

## Existing runtime integration

Pixelbolt emits a TexturePacker-style frame hash with source sizes, trim offsets, durations in milliseconds, and Aseprite-style `meta.frameTags`. Those frame fields are already accepted by `AsepriteSheet.parse`. Its loader extension can load an atlas by `Asset.type('asepriteSheet', url)` and resolve the image relative to the atlas when the files are hosted together without renaming.

There is one semantic mismatch: Pixelbolt stores `loop` in its extra `animations` object, while its frame tags omit `repeat`. The existing ExoJS Aseprite parser treats a missing repeat count as infinite looping. The build adapter validates the single contiguous forward animation, keeps its frame data, adds Aseprite `repeat: "1"` for one-shots or `repeat: "0"` for loops, and drops the unused extra animation object. These numeric strings match the public Aseprite type; ExoJS normalizes zero to infinite repeat. Frame durations remain explicit and are converted to seconds by the existing parser. There is no new runtime format or player.

The gallery explicitly loads the texture descriptor and JSON descriptor, then calls `AsepriteSheet.parse(data, texture)`. This keeps the pair correct when a production bundler gives the PNG a hashed URL. It sets `ScaleModes.Nearest`, disables mipmaps, and attaches the resulting sprites to the scene so the normal animation system advances them. Manual `update()` is used only for deliberate frame inspection; normal playback is not ticked twice.

The exported Pixelbolt anchors/pivots remain metadata. Aseprite playback does not automatically apply Pixelbolt-specific pivots; the gallery intentionally centers each full frame for side-by-side inspection. Gameplay callers can set the sprite anchor explicitly from the exported normalized pivot and position it at the desired contact point. Do not discard trim/source offsets if adding trimming later.

### Baked and live effects

Baked playback preserves authored silhouettes and timing, so it suits the impact burst, activation, discharge, and fixed smoke loop. Dynamic emitters can respond to movement, forces, and changing emission rates. The gallery demonstrates live sparks with the existing `BurstSpawn`, force, drag, and color-over-lifetime modules, and live smoke with an atlas frame, `RateSpawn`, scale, and alpha-over-lifetime modules. These are illustrative live variants, not simulations that reproduce the baked clips frame for frame. Live interpolation can use intermediate colors and fractional positions; the palette-only/binary-alpha guarantee applies to the baked assets.

No second particle engine, public effect registry, shared preset API, or changes to `packages/exojs-build`, `packages/exojs-cli`, or Core are needed for this proof. Keep this authoring workflow optional until actual game usage establishes whether a reusable CLI command or a broader asset profile is worth maintaining.

## Playground and checks

The example is `showcase/pixel-vfx-gallery` in the existing Playground. It shows native and 2x sprites, per-effect replay and frame stepping, playback/repeat controls, and live particle variants. The example uses the existing scene/UI helpers and asset loaders. `ResponsiveCanvasSizing`, `pixelRatio: 1`, position snapping, and pixelated canvas presentation keep the backing resolution aligned with the displayed canvas instead of resampling a fixed-size framebuffer.

```sh
pnpm build:all
pnpm --filter @codexo/exojs-examples dev
# Select Pixel VFX Gallery, or use ?example=showcase/pixel-vfx-gallery

pnpm exec vitest run --project exojs test/scripts/pixel-vfx.test.ts
pnpm exec vitest run --project exojs test/examples/pixel-vfx-gallery.test.ts test/site/preview-modules.test.ts
pnpm exec vitest run --project exojs-demo-assets packages/exojs-demo-assets/test/catalog-entrypoints.test.ts packages/exojs-demo-assets/test/catalog-closure.test.ts
pnpm assets:pixel-vfx:check
pnpm typecheck:examples
pnpm examples:sync:check

pnpm site:build
pnpm test:examples:smoke --only pixel-vfx-gallery --renderer webgl2 --shots .workspace/pixel-vfx/browser --shot-times 2,5,10
```

Validation covers schema violations, explicit positive timing, atlas order and dimensions, finite/infinite repeat, palette membership, binary alpha, visible pixels near borders, nontransparent gutters, stale output, and real Aseprite parsing of all six exports. Generated files are checked against sources by the explicit Pixelbolt build command; downloading the external authoring tool is not a prerequisite for ordinary runtime consumers or standard demo viewing.

The gallery harness checks initial live emission, emitter toggling, and step/resume repeat behavior using the real scene and particle modules. The preview test executes the import-map setup. Those checks cannot establish rendered pixels. Before promoting the proof to a finished asset pack, inspect the actual Playground at integer and noninteger viewport sizes, including 1000 x 625 CSS pixels, replay and step each effect, check the smoke seam in motion, and compare light/dark scene backgrounds. Browser playback and interaction acceptance could not be completed in the initial implementation environment because no local browser was available and browser installation failed; keep that acceptance open until the smoke command and manual motion review run successfully.

Byte identity has been verified between separate render processes and a second clean installation of the pinned tool on Node 24.22.1. Each proof records Node and zlib versions. Cross-platform byte identity is not established; compare decoded pixel buffers and metadata as well as PNG bytes when qualifying another platform. Fixed art, timing, and palette do not by themselves prove browser scaling quality or temporal readability.

## Provenance and next decision

The six recipes, palette, and resulting artwork were created for this ExoJS proof of concept and follow the repository's MIT license. No upstream example artwork, character screenshot, Tripo mesh, proprietary texture, or third-party palette is included. The exact copied Pixelbolt schema is MIT-licensed by its upstream author; `PIXELBOLT-LICENSE` carries that notice. Pixelbolt remains separately installed and pinned at version 0.11.0, commit `20cfdb478666cac39b5e474667735ba470e4d1f4`.

Primary upstream references: [Pixelbolt source and export documentation](https://github.com/skulitom/Pixelbolt/tree/20cfdb478666cac39b5e474667735ba470e4d1f4), [recipe schema](https://github.com/skulitom/Pixelbolt/blob/20cfdb478666cac39b5e474667735ba470e4d1f4/schema.json), [CLI](https://github.com/skulitom/Pixelbolt/blob/20cfdb478666cac39b5e474667735ba470e4d1f4/bin/pixelbolt.js), and [MIT license](https://github.com/skulitom/Pixelbolt/blob/20cfdb478666cac39b5e474667735ba470e4d1f4/LICENSE).

The independent [character pipeline evaluation](character-pipeline.md) documents PixelOver/Blender capabilities and the real model files needed before a 3D-to-sprite trial can be claimed.
