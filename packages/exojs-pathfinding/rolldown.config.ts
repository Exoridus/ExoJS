import { defineRuntimeModule } from '@codexo/exojs-config/rolldown';

// A single side-effect-free entry. No package-internal `#` imports (all
// relative `./`), so no source condition is needed.
export default defineRuntimeModule({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts'],
});
