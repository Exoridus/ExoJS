import { createExtensionConfig } from '@codexo/exojs-config/rollup';

export default createExtensionConfig({
  root: import.meta.dirname,
  sourceCondition: null,
  // React integration has a single entry (no `register` side-effect module) and
  // peers React out of the bundle.
  inputs: ['src/index.ts'],
  external: ['react', 'react-dom'],
});
