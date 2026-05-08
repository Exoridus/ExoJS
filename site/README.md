# ExoJS Site

Astro + Lit docs/playground app for ExoJS. This package is private and is not published to npm.

## Relationship to `../examples`

- `../examples` is the canonical source for example scripts, manifest, and shared assets.
- `npm run examples:sync` mirrors `../examples` into `site/public/examples` and `site/public/assets` for playground runtime serving.
- `site/public/examples` and `site/public/assets` are generated artifacts (gitignored).

This keeps source ownership outside the site framework while preserving the existing runtime contract (`preview.html` + static `examples/*.js` + `assets/*` URLs).

## Local development

```bash
cd site
npm install
npm run dev
```

Prerequisite for `vendor:sync:exo`: build the library once from repo root so `../dist` exists.

```bash
cd ..
npm run build
```

## Build

```bash
cd site
npm run build
npm run preview
```

## Structure

- `src/` — Astro pages and Lit playground shell
- `public/` — static site assets (`preview.html`, favicons, manifest, vendor bundles)
- `scripts/` — sync scripts for vendor artifacts and generated static mirrors
- `tests/` — smoke tests for built output
