import { createExtensionConfig } from '@codexo/exojs-config/rollup';

// LDtk has no package-internal `#` imports (all same-directory `./`), so no
// source condition / node-resolve is needed; Core's `#` resolves to its dist.
export default createExtensionConfig({
  root: import.meta.dirname,
  sourceCondition: null,
});
