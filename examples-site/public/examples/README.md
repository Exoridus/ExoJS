# Runtime-preview example scripts

These files back the live preview in the ExoJS examples site. They are loaded as static `.js` at runtime by the Astro + Lit preview frame and executed inside a Monaco-editor-backed iframe.

## These files are not the canonical example source

The canonical, typechecked examples for ExoJS live in [`/examples`](../../../examples/) at the repo root. Those files are validated on every CI run via `npm run typecheck:examples`, which is part of `verify:package`.

If you want to demonstrate API shape, read or contribute a `.ts` file in `/examples`. The files here exist to feed the live browser preview, which uses a different module and asset loading shape.

## When updating both

If you change a canonical `.ts` example in `/examples` in a way that affects demonstrated API, update the matching runtime-preview `.js` here too (or remove the stale preview). The canonical source is the one that decides what the API looks like; this folder is the presentation layer.

## Layout

- `examples.json` — metadata consumed by the navigation UI
- `shared/runtime.*` — shared runtime bootstrap used by preview scripts
- `collision-detection/`, `extras/`, `input/`, `particle-system/`, `rendering/`, `webgpu/` — category-grouped runtime scripts
