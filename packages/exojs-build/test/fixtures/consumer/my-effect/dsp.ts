// An ordinary TypeScript module the worklet imports. Nothing about it is
// worklet-specific: that is the point of authoring worklets as real modules.

/** Registered processor name, shared by the worklet and its main-thread wrapper. */
export const MY_EFFECT_PROCESSOR = 'exojs-build-saturator-dsp';

/** Soft-clips a sample, normalised so full scale stays full scale. */
export const saturate = (sample: number, drive: number): number => Math.tanh(sample * drive) / Math.tanh(drive);
