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
- `load(type, path | paths | items, options?)` — load and return resources
- `backgroundLoad()` — start loading all registered items concurrently
- `loadAll()` — await all registered items
- `get(type, alias)` / `peek(type, alias)` / `has(type, alias)` — retrieval
- `unload(type, alias)` / `unloadAll(type?)` — cleanup
- `destroy()` — tear down loader and all factories

## Notes

- resource path prefixing is controlled by `resourcePath`
- persistence is opt-in via the `cache` option on `LoaderOptions`
- `IndexedDbStore` wraps IndexedDB as a `CacheStore`
- background loads respect `concurrency` (default 6); direct `load()` calls bypass the limit
