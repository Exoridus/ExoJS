/** Shared DSP helper, imported by the worklet fixture and by the spec that checks it. */
export const saturate = (sample: number, drive: number): number => Math.tanh(sample * drive) / Math.tanh(drive);
