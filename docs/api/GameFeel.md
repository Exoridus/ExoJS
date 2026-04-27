# Game-Feel Essentials

This page summarizes the gameplay-facing APIs added in the game-feel wave.

## AnimatedSprite

```ts
import { AnimatedSprite } from '@codexo/exojs';

sprite.play('walk');
sprite.pause();
sprite.resume();
sprite.stop();
```

`AnimatedSprite` supports named clips, loop control, `onFrame`, and `onComplete`.

## Scene Stacking

```ts
await app.sceneManager.pushScene(new PauseScene(), {
    mode: 'modal',
    input: 'capture',
    transition: { type: 'fade', duration: 220 },
});
```

- `overlay`: below scene updates and draws
- `modal`: below scene draws but does not update
- `opaque`: below scene neither updates nor draws

Input modes:

- `capture`
- `passthrough`
- `transparent`

## Camera/View Helpers

```ts
const view = app.renderManager.view;

view.follow(player, { lerp: 0.2 });
view.setBounds(new Rectangle(0, 0, worldWidth, worldHeight));
view.setZoom(1.25);
view.shake(8, 180, { frequency: 14, decay: true });
```

## Sound Pooling and Audio Sprites

```ts
const uiSfx = loader.get(Sound, 'uiSfx');

uiSfx.setPoolSize(8);
uiSfx.defineSprite('click', { start: 0.00, end: 0.12 });
uiSfx.defineSprite('confirm', { start: 0.12, end: 0.36 });

uiSfx.playSprite('click');
uiSfx.playPooled();
```

`SoundFactory` loader options also support `poolSize` and `sprites`.
