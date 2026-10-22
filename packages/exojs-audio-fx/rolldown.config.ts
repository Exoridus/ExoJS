import { defineRuntimeModule } from '@codexo/exojs-config/rolldown';

// The effects, DSP, BeatDetector and AudioAnalyser. Modules reference each
// other relatively, so no package source condition is required.
export default defineRuntimeModule({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts'],
});
