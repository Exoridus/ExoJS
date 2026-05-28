# @codexo/exojs-assets

Asset catalog and resolver for ExoJS examples and playground.

## Structure

```
packages/assets/
  demo/           Demo assets used by guides, playground, and examples
    textures/     Sprite textures (bunny, particle, rainbow, uv)
    sprites/      Spritesheet images and JSON data (buttons, explosion)
    audio/        Audio files (example.ogg)
    fonts/        Web fonts (AndyBold)
    svg/          SVG images (tiger)
    video/        Video files (example.webm)
    input-prompts/ Input prompt sprites and JSON mappings
  technical/      Technical test/diagnostic assets
    alpha/        Alpha blending test images
    filtering/    Texture filtering test images
    color/        Color space test images
  src/            Source code
  scripts/        Validation and maintenance scripts
```

## Usage (site/playground)

```ts
import { rawAssets, resolveAssetCatalog } from '@codexo/exojs-assets';

const assets = resolveAssetCatalog(rawAssets, '/ExoJS/assets/');
// assets.textures.bunny → '/ExoJS/assets/demo/textures/bunny.png'
```

## Usage (examples — loose-coupled)

Examples receive resolved assets via the playground runtime:

```ts
// injected by playground shell
declare const assets: Record<string, unknown>;

const bunnyUrl = assets.textures.bunny;
```

Examples do **not** import `@codexo/exojs-assets` directly at runtime.

## Validation

```sh
pnpm exec tsx packages/assets/scripts/validate-catalog.ts
```

Checks that all catalog paths reference existing files and that no files are missing from the catalog.
