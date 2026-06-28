// @codexo/exojs-aseprite/register — explicit registration entry.
// Importing this entry registers the default asepriteExtension descriptor
// in the global ExtensionRegistry. Subsequently constructed Applications
// that use global defaults will receive the Aseprite extension.
// This is the only side-effectful entry in this package.

import { ExtensionRegistry } from '@codexo/exojs/extensions';

import { asepriteExtension } from './asepriteExtension';

ExtensionRegistry.register(asepriteExtension);

export * from './public';
