import { createExtensionBuildOptions } from '@codexo/exojs-config/rolldown';

// Tiled has no package-internal `#` imports (all same-directory `./`), so no
// source condition / node-resolve is needed; Core's `#` resolves to its dist.
export default createExtensionBuildOptions({
  root: import.meta.dirname,
  sourceCondition: null,
});
