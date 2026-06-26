// @codexo/exojs-ldtk/register — explicit registration entry.
// Importing this entry registers the default ldtkExtension descriptor
// in the global ExtensionRegistry. Subsequently constructed Applications
// that use global defaults will receive the LDtk extension.
// This is the only side-effectful entry in this package.

import { ExtensionRegistry } from '@codexo/exojs/extensions';

import { ldtkExtension } from './ldtkExtension';

ExtensionRegistry.register(ldtkExtension);

export * from './public';
