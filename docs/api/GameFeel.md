# Game-Feel Essentials

Phase 1 adds practical gameplay-facing tools on top of the stable ExoJS runtime.

## Animated Sprite Example

```ts
import { AnimatedSprite, Spritesheet, Texture } from 'exojs';

const texture = await Texture.load('assets/hero.png');
const sheetData = {
    frames: {
        walk_0: { frame: { x: 0, y: 0, w: 32, h: 32 } },
        walk_1: { frame: { x: 32, y: 0, w: 32, h: 32 } },
    },
    animations: {
        walk: ['walk_0', 'walk_1'],
    },
};

const sheet = new Spritesheet(texture, sheetData);
const hero = AnimatedSprite.fromSpritesheet(sheet);

hero.play('walk');
```

## Scene Stacking Example (Pause Overlay)

```ts
import { Scene } from 'exojs';

class GameScene extends Scene {}
class PauseScene extends Scene {}

const gameScene = new GameScene();
const pauseScene = new PauseScene();

await app.sceneManager.setScene(gameScene);

// modal: world still draws, but does not update/input below
await app.sceneManager.pushScene(pauseScene, {
    mode: 'modal',
    input: 'capture',
});

// fade replace when leaving pause
await app.sceneManager.setScene(gameScene, {
    transition: { type: 'fade', duration: 220 },
});
```

`mode` behavior:
- `overlay`: below scene updates and draws
- `modal`: below scene draws, but does not update
- `opaque`: below scene neither updates nor draws

`input` behavior:
- `capture`: stop routing below
- `passthrough`: route to lower scenes unless `handleInput(...)` returns `false`
- `transparent`: skip this scene for routed input

## Camera Follow / Shake Example

```ts
import { Rectangle } from 'exojs';

const view = app.renderManager.view;

view.follow(player, { lerp: 0.2 });
view.setBounds(new Rectangle(0, 0, worldWidth, worldHeight));
view.setZoom(1.25);

// impact feedback
view.shake(8, 180, { frequency: 14, decay: true });
```

## SFX Pooling + Audio Sprite Example

```ts
import { Sound } from 'exojs';

const uiSfx = loader.get(Sound, 'uiSfx');

uiSfx.setPoolSize(8);
uiSfx.defineSprite('click', { start: 0.00, end: 0.12 });
uiSfx.defineSprite('confirm', { start: 0.12, end: 0.36 });

uiSfx.playSprite('click');
uiSfx.playPooled(); // full-file one-shot
```

For loader options, `Sound` assets also accept `poolSize` and `sprites` in `SoundFactory`.
