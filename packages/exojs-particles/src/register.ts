// @codexo/exojs-particles/register — explicit registration entry.
// Importing this entry registers the default particlesExtension descriptor
// in the global ExtensionRegistry. Subsequently constructed Applications
// that use global defaults will receive the Particles extension.
// This is the only side-effectful entry in this package.

import { ExtensionRegistry } from '@codexo/exojs/extensions';

import { particlesExtension } from './particlesExtension';

ExtensionRegistry.register(particlesExtension);

export * from './public';
