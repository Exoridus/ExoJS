import type { Extension } from '@codexo/exojs/extensions';

import { asepriteBinding } from './asepriteBinding';

/**
 * Default immutable Aseprite extension descriptor.
 *
 * Registers one asset binding:
 * - {@link asepriteBinding} — `loader.load(Asset.kind('asepriteSheet', 'hero.aseprite.json'))` →
 *   fetches the Aseprite JSON, resolves and loads the packed texture, and
 *   returns a fully-parsed {@link AsepriteSheet} with all frame-tag clips.
 *
 * Use with `ApplicationOptions.extensions` or call
 * `import '@codexo/exojs-aseprite/register'` for global auto-registration.
 */
export const asepriteExtension: Extension = Object.freeze({
  id: '@codexo/exojs-aseprite',
  assets: [asepriteBinding],
});
