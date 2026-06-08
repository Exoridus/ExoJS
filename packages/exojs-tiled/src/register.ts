// @codexo/exojs-tiled/register — explicit registration entry.
// Importing this entry registers the default tiledExtension descriptor
// in the global ExtensionRegistry. Subsequently constructed Applications
// that use global defaults will receive the Tiled extension.
// This is the only side-effectful entry in this package.

import { ExtensionRegistry } from '@codexo/exojs/extensions';

import { tiledExtension } from './tiledExtension';

ExtensionRegistry.register(tiledExtension);

export * from './public';
