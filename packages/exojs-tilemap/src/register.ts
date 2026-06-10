// @codexo/exojs-tilemap/register — explicit registration entry.
// Importing this entry registers the default tilemapExtension descriptor
// in the global ExtensionRegistry. Subsequently constructed Applications
// that use global defaults will receive the tilemap extension.
// This is the only side-effectful entry in this package.

import { ExtensionRegistry } from '@codexo/exojs/extensions';

import { tilemapExtension } from './tilemapExtension';

ExtensionRegistry.register(tilemapExtension);

export * from './public';
