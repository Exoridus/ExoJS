# Audio (Sound and Music)

ExoJS audio APIs are centered around `Sound` and `Music`.

## Sound

`Sound` is designed for short/interactive clips and supports:

- normal playback (`play`, `pause`)
- pooled playback (`playPooled`, `setPoolSize`)
- audio sprites (`defineSprite`, `playSprite`)

```ts
const sfx = loader.get(Sound, 'uiSfx');

sfx.setPoolSize(8);
sfx.defineSprite('click', { start: 0.00, end: 0.12 });
sfx.playSprite('click');
```

## Music

`Music` is for long-form tracks with standard media controls.

```ts
const music = loader.get(Music, 'theme');
music.setLoop(true).play();
```

## Loader Options for Sound

`SoundFactory` accepts:

- `playbackOptions`
- `poolSize`
- `sprites`

This allows declaring SFX pooling/sprites directly in loader manifests/options.
