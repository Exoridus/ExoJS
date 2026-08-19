import { createExtensionBuildOptions } from '@codexo/exojs-config/rolldown';

// Audio-fx is a library package (no `/register`): the effects, DSP, BeatDetector
// and AudioAnalyser. Modules reference each other relatively, so no package
// source condition is required.
export default createExtensionBuildOptions({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts'],
});
