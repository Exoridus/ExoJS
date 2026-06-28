# @codexo/exojs-aseprite

Official ExoJS extension for loading [Aseprite](https://www.aseprite.org) JSON sprite-sheet
exports into a ready-to-animate sprite, with one animation clip per Aseprite frame tag.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-aseprite
```

`@codexo/exojs` is a peer dependency. This package has no other runtime dependencies.

> Export your sprite sheet from Aseprite as a **JSON + PNG** pair (`File → Export Sprite Sheet`,
> *Output → JSON Data*). Either array or hash frame mode works; frame tags become animation clips.

## What this package provides

- `AsepriteSheet` — parsed sprite sheet; the result of `loader.load(AsepriteSheet, url)`. Exposes
  the underlying `spritesheet`, a `clips` map (one `AnimatedSpriteClipDefinition` per frame tag),
  and `createAnimatedSprite()` for a ready-to-play `AnimatedSprite`
- `asepriteExtension` — extension descriptor registering the Aseprite asset binding
- `asepriteBinding` — the underlying `AssetBinding` (advanced/custom wiring)
- `AsepriteFormatError` — typed error thrown on malformed Aseprite JSON
- `AsepriteData` and related types (`AsepriteFrameData`, `AsepriteFrameTag`, `AsepriteMeta`,
  `AsepriteSlice`, …) plus the `isAsepriteArrayData` guard

## Usage

Register the extension, load an Aseprite JSON export, and create an animated sprite. The extension
fetches the JSON, resolves and loads the packed texture, and builds one clip per frame tag:

```ts
import { Application } from '@codexo/exojs';
import { AsepriteSheet, asepriteExtension } from '@codexo/exojs-aseprite';

const app = new Application({ extensions: [asepriteExtension] });

const sheet = await app.loader.load(AsepriteSheet, 'sprites/hero.aseprite.json');

const sprite = sheet.createAnimatedSprite();
sprite.play('run'); // 'run' is an Aseprite frame-tag name
app.scene.root.addChild(sprite);
```

Clip frame rate is derived from each frame's Aseprite `duration` (falling back to 12 fps). Frame
indices in a tag are resolved against the ordered frame array; out-of-range indices are skipped.

## `/register` convenience entry

Importing `/register` registers `asepriteExtension` in the global `ExtensionRegistry`, so
subsequently created Applications that use global defaults pick it up automatically:

```ts
// Side effect: registers asepriteExtension in the global ExtensionRegistry.
import '@codexo/exojs-aseprite/register';

// All named exports are also re-exported from /register:
import { AsepriteSheet, asepriteExtension } from '@codexo/exojs-aseprite/register';
```

This is the only side-effectful entry — importing the package root (`@codexo/exojs-aseprite`) does
**not** register anything.

## Texture ownership

The packed texture is loaded via the Loader and stays in the Loader cache. `AsepriteSheet.destroy()`
releases the parsed sprite sheet; the Loader handles texture lifecycle and deduplication.

## Core compatibility

| `@codexo/exojs-aseprite` | `@codexo/exojs` |
|---|---|
| 0.14.x | 0.14.x |

## Links

- [API reference](https://exojs.dev/api/exojs-aseprite)
- [Aseprite](https://www.aseprite.org)

## License

MIT © Codexo
