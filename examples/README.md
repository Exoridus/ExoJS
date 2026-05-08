# ExoJS Examples

Framework-agnostic ExoJS example sources and shared assets.

## Layout

- `examples.json` — authoritative examples catalog used by the playground and guide pages
- `assets/` — shared runtime assets (`audio/`, `font/`, `image/`, `json/`, `svg/`, `video/`)
- `<chapter>/` — chapter-scoped example `.js` files
- `shared/` — shared runtime helper and editor typings for playground preview execution

## Contract

- This directory is treated as engine material, not site-framework material.
- The docs/playground app under `../site/` consumes these files, but this folder remains runnable as static content (`npx serve examples`).
