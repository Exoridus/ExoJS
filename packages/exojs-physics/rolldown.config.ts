import { defineRuntimeModule } from '@codexo/exojs-config/rolldown';

// Two entries: the world/collision API behind `@codexo/exojs/physics`, and the
// debug draw layer that `@codexo/exojs/debug` re-exports. No package-internal
// `#` imports - modules reference each other relatively, so no source
// condition is required.
export default defineRuntimeModule({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts', 'src/debug/index.ts'],
});
