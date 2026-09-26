# @codexo/exojs-aseprite

Load Aseprite JSON sprite-sheet exports as typed ExoJS assets, preserving tagged animation sequences, frame timing, and trimmed-frame offsets.

## Install and activate

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-aseprite
```

Core is a peer dependency. Add `asepriteExtension` to the application; importing the package alone does not install a loader.

```ts
import { Application, Asset, type RenderingContext, Scene } from '@codexo/exojs';
import { asepriteExtension } from '@codexo/exojs-aseprite';

class CharacterScene extends Scene {
  override async load(): Promise<void> {
    const sheet = await this.loader.load(Asset.type('asepriteSheet', 'sprites/hero.json'));
    const character = sheet.createAnimatedSprite();

    if (sheet.clips.has('walk')) {
      character.play('walk');
    }
    character.setPosition(100, 100);
    this.root.addChild(character);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { CharacterScene },
  extensions: [asepriteExtension],
  canvas: { width: 800, height: 600, mount: 'body' },
  loader: { basePath: new URL('assets/', document.baseURI).href },
});

await app.start(CharacterScene);
```

Provide `sprites/hero.json` and its referenced image beneath the configured asset base. Aseprite's export can use Array or Hash frame layout. The animation system advances an attached `AnimatedSprite`; do not also advance it manually every frame.

## Before using an export

Always name the `asepriteSheet` type explicitly. The adapter does not claim all `.json` files, so loading the same URL as a bare JSON path does not parse an Aseprite sheet.

Tag names must exist in the export. Direction expands the tag's frame sequence; per-frame hold durations take precedence over the display-average FPS. Clip repeat counts describe complete cycles, not the additional-repeat convention of a property tween.

A loader scope owns its asset claims, including the referenced image dependency. Scene teardown releases scene claims; manually destroying a shared texture is not the way to unload one character. The sheet's metadata does not automatically create gameplay colliders or UI behavior from slices.

## Documentation

[Aseprite guide](https://exoridus.github.io/ExoJS/en/guide/assets/aseprite/) · [Animation guide](https://exoridus.github.io/ExoJS/en/guide/rendering/animation/) · [AsepriteSheet API](https://exoridus.github.io/ExoJS/en/api/aseprite-sheet/) · [Aseprite playground](https://exoridus.github.io/ExoJS/en/playground/?example=assets/aseprite-spritesheet)

## License

MIT © Codexo
