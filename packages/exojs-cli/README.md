# @codexo/exojs-cli

Command line tools for ExoJS projects. Run the package with `npx`; there is nothing to install permanently and nothing pinned to an engine version.

```sh
npx --package @codexo/exojs-cli exo --help
```

## `exo serve [dir]`

Serves an already-built app over HTTP. It is a file server, not a toolchain: nothing is watched, bundled or transformed. What it adds over a generic static server is the part a built ExoJS app actually needs.

- The content types the engine's formats depend on. A generic server labels `.wasm`, `.ktx2` and `.exoa` `application/octet-stream`, and `WebAssembly.instantiateStreaming` then refuses the response rather than guessing.
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, which is what makes `SharedArrayBuffer` and a high-resolution clock available.
- A fallback to `index.html` for a path that matches no file, so client-side routes resolve.

```sh
npx --package @codexo/exojs-cli exo serve dist --port 8080
npx --package @codexo/exojs-cli exo serve dist --no-spa
npx --package @codexo/exojs-cli exo serve dist --no-cross-origin-isolation   # for embedded third-party content
```

## `exo create [name]`

Scaffolds a new app. Identical to `npm create exo-app`: both run the same scaffolder over the same templates.

```sh
npx --package @codexo/exojs-cli exo create my-game --template game-starter
```

## `exo doctor [dir]`

Checks whether an installed project can run what it asks for: the Node version `@codexo/exojs` declares, a single package manager, one version line across the engine and its extensions, and browser targets that can reach WebGL2 and WebGPU. One line per check, with a command for each failure.

```sh
npx --package @codexo/exojs-cli exo doctor
```

## `exo assets pack <pack-description> [--manifest <path>]`

Packs the assets a JSON pack description lists into one `.exoa` container, which the engine unpacks in a single request through `loader.loadContainer()`.

```json
{
  "output": "../dist/level1.exoa",
  "assets": [
    { "source": "images/hero.png", "type": "texture", "file": "hero.png", "mime": "image/png" },
    { "source": "audio/jump.wav", "type": "sound", "file": "jump.wav" },
    { "source": "data/level1.json", "type": "json", "file": "level1.json" }
  ]
}
```

```sh
npx --package @codexo/exojs-cli exo assets pack assets/level1.json
```

`source` is the logical path the entry stands in for - the same string a network load would use, so a packed asset and a loose one are one identity. `file` is where the bytes are read from at pack time. Every path inside the description - `output` included - resolves against the description's own directory, which is why the example above writes into `dist/` from a description that lives in `assets/`.

The container is compressed in blocks that span several assets, so compression sees shared context across them, and each block is kept compressed only where that is actually smaller - already-compressed payload such as PNG, KTX2, audio and video is stored as it is. There is nothing to configure.

With `--manifest <path>`, the pack is written next to `output` under a content-addressed name (`level1.<hash>.exoa`) and the asset manifest at `<path>` is created or updated to point at it. Unlike the paths inside the description, `--manifest` resolves against the current directory, and the pack has to land inside the manifest's own directory - here both are `dist/`:

```sh
npx --package @codexo/exojs-cli exo assets pack assets/level1.json --manifest dist/assets.json
```

A pack file named after its own hash changes its URL exactly when its bytes change, so it can be served with an immutable cache lifetime, and the manifest is the one URL a client has to re-read. Packing each pack in its own invocation builds one manifest holding all of them; the pack is named after the description's optional `"name"`, or after the `output` file's stem. A pack file that a re-pack replaces is left on disk, because a deployment still serving the previous manifest is still handing out that name. The engine reads the manifest with `loader.loadManifest(url)` and loads a pack with `loader.loadContainer(manifest.pack('level1'))`.

## Versioning

This package is versioned independently of the engine. It is installed once and never pinned to an engine release, so its version says nothing about which `@codexo/exojs` a project uses.

## License

MIT © Codexo
