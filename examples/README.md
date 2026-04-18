# ExoJS Source Examples

These are focused source examples that match the current ExoJS product surface.

## Examples

- [`01-quickstart.ts`](./01-quickstart.ts): first scene + basic rendering
- [`02-asset-manifest-bundles.ts`](./02-asset-manifest-bundles.ts): manifest/bundle workflow
- [`03-animated-sprite.ts`](./03-animated-sprite.ts): clip playback
- [`04-scene-stacking-pause.ts`](./04-scene-stacking-pause.ts): stack policies and pause overlay
- [`05-camera-follow-shake.ts`](./05-camera-follow-shake.ts): follow, bounds, zoom, shake
- [`06-visual-effects.ts`](./06-visual-effects.ts): filters, masks, render pass, cache-as-bitmap
- [`07-performance-stats.ts`](./07-performance-stats.ts): culling and render stats
- [`08-physics-rapier.ts`](./08-physics-rapier.ts): optional Rapier integration

## Notes

- These files are intentionally compact and documentation-first.
- This folder is the canonical source-of-truth for example code. It is typechecked against the public API on every CI run via `npm run typecheck:examples`.
- For browser-runnable demos with a live code editor, see the sibling site at [`../examples-site/`](../examples-site/). It is deployed as the GitHub Pages site for this repository.
