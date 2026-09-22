# ExoJS Site

Astro + Lit docs/playground app for ExoJS. This package is private and is not published to npm.

## Relationship to `../examples`

- `../examples` is the canonical source for example scripts, manifest, and shared assets.
- `examples:sync` mirrors `../examples` into `site/public/examples` and `site/public/assets` for playground runtime serving.
- `site/public/examples` and `site/public/assets` are generated artifacts (gitignored).

This keeps source ownership outside the site framework while preserving the existing runtime contract (`preview.html` + static `examples/*.js` + `assets/*` URLs).

## Local development

Install the workspace and build the library once from the repository root so the site can sync `../dist` into its private vendor directory:

```bash
pnpm bootstrap
pnpm build
pnpm --filter @codexo/exojs-examples dev
```

Do not run a separate install inside `site/`; it is already a workspace package and uses the root lockfile.

## Build

```bash
pnpm site:build
pnpm --filter @codexo/exojs-examples preview
```

## Structure

- `src/` — Astro pages and Lit playground shell
- `public/` — static site assets (`preview.html`, favicons, manifest, vendor bundles)
- `scripts/` — sync scripts for vendor artifacts and generated static mirrors
- `tests/` — smoke tests for built output
