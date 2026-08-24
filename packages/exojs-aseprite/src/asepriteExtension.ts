import type { Extension } from '@codexo/exojs/extensions';

import { asepriteType } from './asepriteType';

/**
 * Default immutable Aseprite extension descriptor.
 *
 * Installs one asset type:
 * - {@link asepriteType} - `loader.load(asepriteType.asset('hero.aseprite.json'))`
 *   fetches the Aseprite JSON, resolves and loads the packed texture, and
 *   returns a fully-parsed {@link AsepriteSheet} with all frame-tag clips.
 *
 * Pass it to the application that should have it via
 * `ApplicationOptions.extensions`.
 */
export const asepriteExtension: Extension = Object.freeze({
  id: '@codexo/exojs-aseprite',
  assets: [asepriteType],
});
