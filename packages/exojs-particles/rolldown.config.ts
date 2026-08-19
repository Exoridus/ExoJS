import { createExtensionBuildOptions } from '@codexo/exojs-config/rolldown';

// Particles has package-internal `#` imports (renderers/gpu/modules/...), resolved
// to source via its own `@codexo/exojs-particles-source` condition at build time.
export default createExtensionBuildOptions({
  root: import.meta.dirname,
  sourceCondition: '@codexo/exojs-particles-source',
});
