# ExoJS Examples

Browser-runnable companion app for the ExoJS library. Bundles a set of small demos, shows the source in an in-browser Monaco editor, and renders the selected example in a live preview frame.

Deployed as the GitHub Pages site for the ExoJS repository.

## Role in the repository

Runtime-preview example scripts live under [`public/examples/`](./public/examples/) — demo `.js` files loaded at runtime by the Astro + Lit preview frame. See [`public/examples/README.md`](./public/examples/README.md) for layout.

This package is **not published to npm**. It lives beside the library to keep the live site in lockstep with the currently released package, without a second git repo to coordinate.

## Local development

From this folder:

```bash
npm install
npm run vendor:sync      # copies the locally built @codexo/exojs into public/vendor/
npm run dev              # starts the Astro dev server
```

The library dist must exist for `vendor:sync:exo` to succeed. Build it once from the repo root:

```bash
cd ..
npm run build
```

## Production build

```bash
npm run build
npm run preview          # serve the built dist/ locally
npm run test:dist        # smoke test the built output
```

## GitHub Pages

This site is deployed by the `.github/workflows/pages.yml` workflow in the repo root. The build runs on `main` and is decoupled from library CI.

## Backend policy in examples

- Examples outside `public/examples/webgpu/` rely on ExoJS default backend selection (WebGPU when available, WebGL2 fallback).
- Examples under `public/examples/webgpu/` stay explicit about `backend: { type: 'webgpu' }` because backend choice is part of the example's purpose.

## Repository structure

- `src/` — example browser UI (Astro + Lit components)
- `public/` — static assets, vendor shims, and runtime-preview example scripts
- `scripts/` — vendor-sync helpers (@codexo/exojs, Monaco, Kenney input prompts)
- `tests/` — Playwright-backed smoke test for the built site
