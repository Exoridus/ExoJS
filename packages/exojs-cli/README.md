# @codexo/exojs-cli

Command line tools for ExoJS projects. Run it with `npx`; there is nothing to
install and nothing pinned to an engine version.

```sh
npx exo --help
```

## `exo serve [dir]`

Serves an already-built app over HTTP. It is a file server, not a toolchain:
nothing is watched, bundled or transformed. What it adds over a generic static
server is the part a built ExoJS app actually needs.

- The content types the engine's formats depend on. A generic server labels
  `.wasm`, `.ktx2` and `.exoa` `application/octet-stream`, and
  `WebAssembly.instantiateStreaming` then refuses the response rather than
  guessing.
- `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`, which is what makes
  `SharedArrayBuffer` and a high-resolution clock available.
- A fallback to `index.html` for a path that matches no file, so client-side
  routes resolve.

```sh
npx exo serve dist --port 8080
npx exo serve dist --no-spa
npx exo serve dist --no-cross-origin-isolation   # for embedded third-party content
```

## `exo create [name]`

Scaffolds a new app. Identical to `npm create exo-app`: both run the same
scaffolder over the same templates.

```sh
npx exo create my-game --template game-starter
```

## `exo doctor [dir]`

Checks whether an installed project can run what it asks for: the Node version
`@codexo/exojs` declares, a single package manager, one version line across the
engine and its extensions, and browser targets that can reach WebGL2 and WebGPU.
One line per check, with a command for each failure.

```sh
npx exo doctor
```

## `exo assets pack <manifest>`

Packs the assets a JSON manifest lists into one `.exoa` container, which the
engine unpacks in a single request through `loader.loadContainer()`.

```json
{
  "output": "dist/level1.exoa",
  "assets": [
    { "source": "images/hero.png", "type": "texture", "file": "hero.png", "mime": "image/png" },
    { "source": "audio/jump.wav", "type": "sound", "file": "jump.wav" },
    { "source": "data/level1.json", "type": "json", "file": "level1.json" }
  ]
}
```

```sh
npx exo assets pack assets/level1.json
```

`source` is the logical path the entry stands in for - the same string a network
load would use, so a packed asset and a loose one are one identity. `file` is
where the bytes are read from at pack time. Every path resolves against the
manifest's own directory.

The container is compressed in blocks that span several assets, so compression
sees shared context across them, and each block is kept compressed only where
that is actually smaller - already-compressed payload such as PNG, KTX2, audio
and video is stored as it is. There is nothing to configure.

## Versioning

This package is versioned independently of the engine. It is installed once and
never pinned to an engine release, so its version says nothing about which
`@codexo/exojs` a project uses.

## License

MIT © Codexo
