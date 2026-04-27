# Asset Manifests and Bundles

ExoJS provides a thin workflow layer over the loader through manifests and named bundles.

## Types

```ts
interface AssetEntry<T extends Loadable = Loadable> {
    type: T;
    alias: string;
    path: string;
    options?: unknown;
}

interface AssetManifest {
    bundles: Readonly<Record<string, ReadonlyArray<AssetEntry>>>;
}
```

## Define and Register

```ts
import { defineAssetManifest, Texture, Sound } from '@codexo/exojs';

const manifest = defineAssetManifest({
    bundles: {
        boot: [
            { type: Texture, alias: 'logo', path: 'ui/logo.png' },
            { type: Sound, alias: 'click', path: 'audio/click.wav' },
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
```

Progress is also available via `loader.onBundleProgress`.

## Errors

`loadBundle` rejects with `BundleLoadError` when one or more entries fail.

```ts
try {
    await loader.loadBundle('gameplay');
} catch (error) {
    if (error instanceof BundleLoadError) {
        console.error(error.bundle, error.failures);
    }
}
```

## Validation Rules (Highlights)

- bundle names must be non-empty
- entry `type`, `alias`, and `path` must be valid
- duplicate `(type, alias)` within one bundle is rejected
- duplicate bundle names on one loader are rejected
- conflicting `(type, alias)` definitions across manifests are rejected
- unknown bundles throw from `loadBundle` and return `false` from `hasBundle`
