import { createExtensionBuildOptions } from '@codexo/exojs-config/rolldown';

// @codexo/exojs-pathfinding is a library package: a single side-effect-free
// entry. No package-internal `#` imports (all relative `./`), so no source
// condition / node-resolve is needed; Core's `#` resolves to its dist.
export default createExtensionBuildOptions({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts'],
});
