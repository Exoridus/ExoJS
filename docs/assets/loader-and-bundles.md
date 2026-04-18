# Loader and Bundles

ExoJS loader supports both direct typed loads and a manifest/bundle workflow.

## Direct Typed Loads

```ts
import { Texture, Json } from 'exojs';

await loader.load(Texture, { hero: 'sprites/hero.png', bg: 'bg.png' });
const hero = loader.get(Texture, 'hero');

const config = await loader.load<{ speed: number }>(Json, 'config/game.json');
```

## Define and Register a Manifest

```ts
import { defineAssetManifest, Texture, Sound } from 'exojs';

const manifest = defineAssetManifest({
    bundles: {
        boot: [
            { type: Texture, alias: 'logo', path: 'ui/logo.png' },
            { type: Sound, alias: 'click', path: 'audio/click.wav' },
        ],
        gameplay: [
            { type: Texture, alias: 'atlas', path: 'sprites/atlas.png' },
            { type: Texture, alias: 'player', path: 'sprites/player.png' },
        ],
    },
});

loader.registerManifest(manifest);
```

## Load by Bundle Name

```ts
await loader.loadBundle('boot', {
    onProgress(loaded, total) {
        console.log(`boot: ${loaded}/${total}`);
    },
});

await loader.loadBundle('gameplay', { background: true });
```

Bundle behavior:

- `loadBundle(...)` returns `Promise<void>`
- existing cache and in-flight dedup behavior are preserved
- repeated bundle loads are safe
- unknown bundles throw from `loadBundle` and return `false` from `hasBundle`
- `loader.onBundleProgress` emits `(name, loaded, total)`

## Bundle Errors

If any entry fails, `loadBundle` rejects with `BundleLoadError` and includes per-entry failures.
Successfully loaded assets remain cached.

## Practical Boot Flow

- register manifest once during app startup
- load `boot` before showing title/ui
- load `shared` in background while menu is visible
- load `gameplay` when entering the game scene
