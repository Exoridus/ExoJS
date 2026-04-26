# Audio Workflow

ExoJS provides `Sound` and `Music` for common game-audio usage.

## Basic Sound Playback

```ts
import { Sound } from 'exojs';

const click = loader.get(Sound, 'click');
click.play();
```

## Sound Pooling (SFX)

Use pooling for frequent overlapping one-shots:

```ts
click.setPoolSize(8);
click.playPooled();
```

You can also configure this via loader options in `SoundFactory` input.

## Audio Sprites

Define clip ranges inside one audio source:

```ts
click.defineSprite('confirm', { start: 0.00, end: 0.22 });
click.defineSprite('cancel', { start: 0.22, end: 0.42 });

click.playSprite('confirm');
```

## Music

Use `Music` for long-form tracks and standard media controls.

```ts
import { Music } from 'exojs';

const theme = loader.get(Music, 'theme');
theme.setLoop(true).play();
```

## Notes

- Sound pooling and audio sprites are gameplay-facing utilities, not a full sequencing system.
- Audio context readiness is handled internally by ExoJS media classes.
