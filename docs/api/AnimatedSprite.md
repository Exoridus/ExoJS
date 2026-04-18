# AnimatedSprite

`AnimatedSprite` extends `Sprite` with named clip playback.

## Clip Definition

```ts
import { AnimatedSprite } from 'exojs';

const sprite = new AnimatedSprite(texture, {
    walk: {
        frames: [frame0, frame1, frame2],
        fps: 12,
        loop: true,
    },
});
```

## Playback API

- `play(name, options?)`
- `pause()`
- `resume()`
- `stop()`

Useful state:

- `currentClip`
- `currentFrame`
- `playing`
- `loop`

Signals:

- `onFrame`
- `onComplete`

## Spritesheet Path

```ts
const animated = AnimatedSprite.fromSpritesheet(sheet);
animated.play('idle');
```

`fromSpritesheet` reads clip metadata from `Spritesheet.animations`.
