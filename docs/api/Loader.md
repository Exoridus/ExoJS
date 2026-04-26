# Loader

`Loader` is the asset loading entrypoint. It uses a class-token dispatch system
that mirrors the `RendererRegistry` pattern — each asset class has a registered
factory, and the loader resolves the correct factory via prototype-chain walking.

## Responsibilities

- load assets by class token (e.g. `Texture`, `Sound`, `Json`)
- delegate decoding/creation to typed `AssetFactory` implementations
- manage an internal resource store keyed by class + alias
- optionally use `CacheStore` implementations for persistence (e.g. IndexedDB)
- background loading with concurrency throttling and priority boost

## Usage

```ts
// Single asset — returns the loaded resource directly
const hero = await loader.load(Texture, 'hero.png');

// Multiple assets with explicit aliases
const textures = await loader.load(Texture, { hero: 'hero.png', bg: 'bg.png' });

// Generic JSON with type assertion
const config = await loader.load<GameSettings>(Json, 'settings.json');

// Background loading
loader.add(Texture, { hero: 'hero.png', enemy: 'enemy.png' });
loader.backgroundLoad();
const hero = await loader.load(Texture, 'hero'); // priority boost

// Retrieval after loading
const tex = loader.get(Texture, 'hero');        // throws if missing
const maybe = loader.peek(Texture, 'hero');     // null if missing

// Cleanup
loader.unload(Texture, 'hero');
loader.unloadAll();
```

## Asset manifests and bundles (MVP)

```ts
import { Loader, Texture, Sound, defineAssetManifest } from 'exojs';

const manifest = defineAssetManifest({
    bundles: {
        boot: [
            { type: Texture, alias: 'logo', path: 'ui/logo.png' },
            { type: Sound, alias: 'click', path: 'audio/click.wav' },
        ],
        shared: [
            { type: Texture, alias: 'atlas', path: 'textures/atlas.png' },
        ],
        gameplay: [
            { type: Texture, alias: 'player', path: 'sprites/player.png' },
            { type: Texture, alias: 'atlas', path: 'textures/atlas.png' }, // shared alias/path is allowed
        ],
    },
});

const loader = new Loader({ resourcePath: '/assets/' });

loader.registerManifest(manifest);

await loader.loadBundle('boot', {
    onProgress(loaded, total) {
        console.log(`boot bundle: ${loaded}/${total}`);
    },
});

await loader.loadBundle('shared', { background: true });
await loader.loadBundle('gameplay');

const logo = loader.get(Texture, 'logo');
```

Bundle notes:

- `loadBundle(name)` loads only that bundle and returns `Promise<void>`
- assets are still retrieved with `get()` / `peek()` / `has()` after loading
- `loader.onBundleProgress` emits `(bundleName, loaded, total)` for bundle-level progress
- `hasBundle(name)` returns `true` only when every entry in the bundle is cached in memory
- unknown bundles throw from `loadBundle()` and return `false` from `hasBundle()`

## Scene integration

```ts
const scene = Scene.create({
    async load(loader) {
        await loader.load(Texture, { hero: 'hero.png' });
        await loader.load(Sound, { jump: 'jump.wav' });
    },
    init(loader) {
        this._sprite = new Sprite(loader.get(Texture, 'hero'));
    },
    unload(loader) {
        loader.unloadAll();
    },
});
```

## Key types

- `AssetFactory<T>` — factory interface (process + create)
- `AssetConstructor<T>` — class reference used as registry key
- `FactoryRegistry` — maps class tokens to factories (prototype-chain walking)
- `CacheStore` — persistent storage interface (e.g. `IndexedDbStore`)
- `LoaderOptions` — configuration (resourcePath, requestOptions, cache, concurrency)

## Dispatch tokens

Built-in class tokens for loading:

| Token | Returns | Factory |
|---|---|---|
| `Texture` | `Texture` | TextureFactory |
| `Sound` | `Sound` | SoundFactory |
| `Music` | `Music` | MusicFactory |
| `Video` | `Video` | VideoFactory |
| `FontFace` | `FontFace` | FontFactory |
| `HTMLImageElement` | `HTMLImageElement` | ImageFactory |
| `Json` | `unknown` (narrow via generic) | JsonFactory |
| `TextAsset` | `string` | TextFactory |
| `SvgAsset` | `HTMLImageElement` | SvgFactory |
| `VttAsset` | `Array<VTTCue>` | VttFactory |
| `ArrayBuffer` | `ArrayBuffer` | BinaryFactory |
| `WebAssembly.Module` | `WebAssembly.Module` | WasmFactory |

Custom types: `loader.register(MyClass, new MyFactory())` — same call shape as built-ins.

## Important methods

- `register(type, factory)` — register a factory for a class token
- `add(type, path | paths | items)` — register aliases without loading
- `registerManifest(manifest)` — register bundle definitions without loading
- `load(type, path | paths | items, options?)` — load and return resources
- `loadBundle(name, options?)` — load a named manifest bundle (`Promise<void>`)
- `backgroundLoad()` — start loading all registered items concurrently
- `loadAll()` — await all registered items
- `get(type, alias)` / `peek(type, alias)` / `has(type, alias)` — retrieval
- `hasBundle(name)` — check if every bundle entry is currently loaded
- `unload(type, alias)` / `unloadAll(type?)` — cleanup
- `destroy()` — tear down loader and all factories

## Notes

- resource path prefixing is controlled by `resourcePath`
- persistence is opt-in via the `cache` option on `LoaderOptions`
- `IndexedDbStore` wraps IndexedDB as a `CacheStore`
- background loads respect `concurrency` (default 6); direct `load()` calls bypass the limit
