import type { Extension } from '@codexo/exojs/extensions';

/**
 * Default immutable tilemap extension descriptor.
 *
 * For this slice (B1 — Generic Tilemap Runtime Foundation) the descriptor
 * contains only the package identity. Renderer bindings will be added in a
 * later renderer slice; no placeholder renderer is shipped now.
 *
 * Use with `ApplicationOptions.extensions` or call
 * `import '@codexo/exojs-tilemap/register'` for global auto-registration.
 * @advanced
 */
export const tilemapExtension: Extension = Object.freeze({
  id: '@codexo/exojs-tilemap',
});
