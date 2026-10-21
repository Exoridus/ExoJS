# @codexo/exojs-demo-assets

Optional demo media for [ExoJS](https://github.com/Exoridus/ExoJS): a typed, flat catalog of asset descriptors for textures, sounds, music, fonts, bitmap fonts, maps, JSON atlases and videos, with licences and a hash manifest.

This package is data and descriptors, not the Core asset system. Importing it or reading a property fetches nothing, decodes nothing and creates no placeholder resources. A resource exists only once a concrete loader has claimed its descriptor.

## Install

```sh
npm install @codexo/exojs @codexo/exojs-demo-assets
```

## Usage

```ts
import { Application } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class Game extends Application {
  protected async prepare() {
    // Claim and start loading one texture; get() returns a handle that fills in.
    const ship = this.loader.get(assets.ship);

    // Await resources that must be ready before use, like video or fonts.
    const video = await this.loader.load(assets.videoHighRes);
  }
}
```

Reading a property such as `assets.ship` only returns its descriptor. Textures and sounds support `loader.get()` and `await loader.load()`; video, music, fonts, bitmap fonts and SVG images have no synchronous handle and load with `await loader.load()`. The catalog object is frozen and reusable across scenes and applications; claims and payload sharing belong to each loader.

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

It copies exactly the standard-profile files listed in `manifest.json` to their manifest paths and verifies each file against its SHA-256.

## Extended media

The standard profile ships in this package (160 files, under 20 MB). The extended HDR10 video candidate does not: it is delivered as a separate archive (`exojs-demo-assets-extended-<version>.zip`) and served from a location you choose.

```ts
import { createExtendedDemoAssets } from '@codexo/exojs-demo-assets/extended';

const extended = createExtendedDemoAssets('https://media.example.com/exojs-demo-extended/');
const hdr = await this.loader.load(extended.videoHdr10);
```

The `videoHdr10` clip carries BT.2020/PQ metadata; whether it is shown as HDR depends on the browser, the display and the rendering path.

## Content

`catalog.json` is the authored source. `manifest.json`, `THIRD_PARTY_NOTICES.md`, the generated TypeScript and the `media/` tree are derived from it by `pnpm generate`. Media provenance, including third-party Kenney assets (CC0-1.0) and the Blender clip candidates, is recorded per file.

## API

- `demoAssets: DemoAssetDefinitions` – the frozen standard catalog.
- `demoAssetCategories: Readonly<Record<DemoAssetKey, DemoAssetCategory>>` – browsing categories.
- `createDemoAssets(baseUrl: string | URL): DemoAssetDefinitions`
- `createExtendedDemoAssets(baseUrl: string | URL): ExtendedDemoAssetDefinitions` (from `/extended`)
- `./manifest.json` – every shipped file with hash, size, role and provenance.
