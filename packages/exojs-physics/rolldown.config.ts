import { createExtensionBuildOptions } from '@codexo/exojs-config/rolldown';

// Physics is a library package (no `/register`); it ships two public subpaths:
// the root world/collision API and the tree-shakeable `./debug` draw layer.
// No package-internal `#` imports - modules reference each other relatively, so
// no source condition is required.
export default createExtensionBuildOptions({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts', 'src/debug/index.ts'],
});
