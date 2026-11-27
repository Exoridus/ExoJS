# @codexo/exojs-tilemap-physics

Since ExoJS v0.20, import from @codexo/exojs/tilemap-physics. This package is a compatibility shim for the 0.20 line; no independent feature development.

Every export of this package is the very binding its Core entry exports, so code that still imports `@codexo/exojs-tilemap-physics` shares one engine instance with code that already imports `@codexo/exojs/tilemap-physics`. The package contains no implementation of its own and depends on nothing but its `@codexo/exojs` peer.

| Import | Replace with | Forwards |
| --- | --- | --- |
| `@codexo/exojs-tilemap-physics` | `@codexo/exojs/tilemap-physics` | everything |

## Migrating

Change each import to the Core entry in the table, then remove this package with `npm uninstall @codexo/exojs-tilemap-physics`. `@codexo/exojs` already contains the module; there is nothing else to install. The migration guide on the ExoJS site lists every renamed import.
