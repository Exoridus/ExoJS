import { createExtensionBuildOptions } from '@codexo/exojs-config/rolldown';

export default createExtensionBuildOptions({
  root: import.meta.dirname,
  sourceCondition: null,
  // React integration has a single entry (no `register` side-effect module) and
  // peers React out of the bundle.
  inputs: ['src/index.ts'],
  external: ['react', 'react-dom'],
});
