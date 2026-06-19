import { createExtensionConfig } from '@codexo/exojs-config/rollup';

// Audio-fx is a library package (no `/register`): the effects, DSP, BeatDetector
// and AudioAnalyser. Modules reference each other relatively, so no package
// source condition is required.
export default createExtensionConfig({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts'],
});
