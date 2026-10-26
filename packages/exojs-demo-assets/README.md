# @codexo/exojs-demo-assets

Optional demo media for [ExoJS](https://github.com/Exoridus/ExoJS): a typed, flat catalog of asset descriptors for textures, sounds, music, fonts, bitmap fonts, maps, JSON atlases and videos, with licences and a hash manifest.

This package is data and descriptors, not the Core asset system. Importing it or reading a property fetches nothing, decodes nothing and creates no placeholder resources. A resource exists only once a concrete loader has claimed its descriptor.

## Install

```sh
npm install @codexo/exojs @codexo/exojs-demo-assets
```

## Usage

```ts
import { Application, type RenderingContext, Scene, Sprite, type Video } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class DemoScene extends Scene {
  private video!: Video;
  private ship!: Sprite;

  override async load(): Promise<void> {
    // Video, music and fonts have no placeholder handle: await them in load().
    this.video = await this.loader.load(assets.videoHighRes);
  }

  override init(): void {
    // Textures and sounds can be claimed synchronously: get() returns a handle
    // that fills in when the file arrives.
    this.ship = new Sprite(this.loader.get(assets.ship)).setPosition(64, 64);
    this.video.applyOptions({ loop: true, muted: true });
    this.video.play();
  }

  override draw(context: RenderingContext): void {
    context.render(this.video);
    context.render(this.ship);
  }
}

const app = new Application({ scenes: { DemoScene }, canvas: { mount: document.body } });

await app.start(DemoScene);
```

Reading a property such as `assets.ship` only returns its descriptor. Textures and sounds support `loader.get()` and `await loader.load()`; video, music, fonts, bitmap fonts and SVG images have no synchronous handle and load with `await loader.load()`. The catalog object is frozen and reusable across scenes and applications; claims and payload sharing belong to each loader.

## Bundlers

Each descriptor in `demoAssets` is a literal `new URL('../media/<file>', import.meta.url)`, which Vite and other bundlers that understand the pattern follow. Two consequences matter for a production build:

- The descriptors live in one module, so any import from the package root, `createDemoAssets` included, makes the bundler emit every standard file (about 29 MB, under hashed names), not only the ones the code loads. A bundler transforms each `new URL(...)` before it removes unused exports. That suits a demo or prototype; a shipped game should load its own media or copy just what it needs.
- Tiled maps, LDtk projects and bitmap fonts reference sibling files by relative path. A bundler that renames files with content hashes, or inlines small ones as `data:` URLs, breaks those references. Serve these formats through the copy command and `createDemoAssets` below.

The Vite dev server serves the media straight from the installed package, relative references included.

The Tiled and LDtk entries are typed as JSON descriptors. Load them as maps through the installed extension's loader type, for example `Asset.type('tileMap', assets.harborPlazaMap.source)` with `@codexo/exojs-tiled` or `Asset.type('ldtkMap', assets.harborWorldProject.source)` with `@codexo/exojs-ldtk`; that is what resolves and fetches their tileset images.

## Hosting the media elsewhere

The default `demoAssets` instance addresses the media shipped inside this package, which works in Node ESM and with bundlers that resolve `new URL(..., import.meta.url)`. Hosts that copy the media to their own directory use the factory:

```ts
import { createDemoAssets } from '@codexo/exojs-demo-assets';

const assets = createDemoAssets(new URL('./demo-media/', import.meta.url));
```

`baseUrl` must be an absolute URL; a relative location has to be resolved by the caller first. Copy the media deterministically with the bundled command:

```sh
npx exojs-demo-assets-copy ./public/demo-media --clean
```

It copies exactly the standard-profile files listed in `manifest.json` to their manifest paths and verifies each file against its SHA-256. Served from that directory, the relative references inside maps, LDtk projects and bitmap fonts resolve unchanged. A bundled production build still emits the hashed catalog files described above next to the copy.

## Extended media

The standard profile ships in this package (195 files, under 30 MB, including seven full-length music recordings). The extended HDR10 video candidate does not: it is delivered as a separate archive (`exojs-demo-assets-extended-<version>.zip`) and served from a location you choose.

```ts
import type { Scene, Video } from '@codexo/exojs';
import { createExtendedDemoAssets } from '@codexo/exojs-demo-assets/extended';

const extended = createExtendedDemoAssets('https://media.example.com/exojs-demo-extended/');

export const loadHdrClip = async (scene: Scene): Promise<Video> => await scene.loader.load(extended.videoHdr10);
```

The `videoHdr10` clip carries BT.2020/PQ metadata; whether it is shown as HDR depends on the browser, the display and the rendering path.

## Content

`catalog.json` is the authored source. `manifest.json`, `THIRD_PARTY_NOTICES.md`, the generated TypeScript and the `media/` tree are derived from it by `pnpm generate`. The generated `THIRD_PARTY_NOTICES.md` collects attribution and the complete license texts for the shipped files; individual source texts remain in `examples/assets/licenses/`. Media provenance, including third-party Kenney assets (CC0-1.0) and the Blender clip candidates, is recorded per file.

The authoring tree and generated media use one directory level: `images/`, `audio/`, `fonts/`, `maps/`, `video/` and `licenses/`. Atlases and audio-sprite tables sit beside their associated media. Maps and bitmap fonts retain relative references to their images. Full upstream packs and longer video sources are not part of the active asset tree. When updating an existing hosted copy, replace it from the new manifest so its paths match the descriptors.

### Music

The music collection covers contrasting timbres and arrangements. These seven CC0 recordings retain their original encoding and level; choose playback gain for the recording and leave headroom when mixing. A cyclic arrangement alone does not guarantee a sample-perfect loop boundary, particularly for MP3 streams.

| Descriptor              | Recording                                                                                                                      | Character and example use                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `musicCalmPiano`        | [JRPG2 Piano](https://opengameart.org/content/jrpg2-piano), Joth                                                               | Quiet solo piano; speech ducking.                                                            |
| `musicLofiRhodes`       | [Mandatory Overtime](https://opengameart.org/content/mandatory-overtime), Joth                                                 | Electric piano and a restrained groove; buses, compression, crossfades and record playback.  |
| `musicAtmosphericSynth` | [Near and Far](https://opengameart.org/content/near-and-far), Joth                                                             | Atmospheric synth arpeggios; streamed playback and crossfades.                               |
| `musicArcadeChiptune`   | [8Bit Title Screen](https://opengameart.org/content/8bit-title-screen), Joth                                                   | Bright, compact chiptune; signal graph.                                                      |
| `musicGlitchMachine`    | [Friendly Talk on a Robotic Battlefield](https://opengameart.org/content/friendly-talk-on-a-robotic-battlefield-looped), illin | Dense, deliberately distorted electronic textures; frequency bands and bass response.        |
| `musicDarkIndustrial`   | [The 9th Circle](https://opengameart.org/content/the-9th-circle), Joth                                                         | Dark industrial textures with a developing arrangement; spectrum and waveform visualisation. |
| `musicActionSynthRock`  | [MonsterVania - Ghost Land](https://opengameart.org/content/monstervania-ghost-land), HydroGene                                | Fast melodic game music with a synthetic rock palette; boss reveal and reactive particles.   |

`musicDrumLoop` remains a percussion-only tempo reference. `musicLoopA` and `musicLoopB` are short synthesized chord signals for isolated technical tests; the showcase examples use the recordings above.

## API

- `demoAssets: DemoAssetDefinitions` – the frozen standard catalog.
- `demoAssetCategories: Readonly<Record<DemoAssetKey, DemoAssetCategory>>` – browsing categories.
- `createDemoAssets(baseUrl: string | URL): DemoAssetDefinitions`
- `createExtendedDemoAssets(baseUrl: string | URL): ExtendedDemoAssetDefinitions` (from `/extended`)
- `./manifest.json` – every shipped file with hash, size, role and provenance.
