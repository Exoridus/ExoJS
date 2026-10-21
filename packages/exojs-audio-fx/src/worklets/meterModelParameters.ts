export interface MeterModelParameters {
  readonly channelPriors: readonly [number, number, number, number];
  readonly minimumScore: number;
  readonly cycleMargin: number;
  readonly phaseMargin: number;
}

export const meterModelParameters: MeterModelParameters = Object.freeze({
  // PCM attack power is independent of FFT-window alignment; band novelty is not.
  channelPriors: Object.freeze([4, 1, 1, 1] as const),
  minimumScore: 0.5,
  cycleMargin: 0.15,
  phaseMargin: 0.35,
});
