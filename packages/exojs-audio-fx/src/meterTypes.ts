export interface MeterModel {
  /** Pulses per cycle of the tracked grid, not necessarily a notated numerator. */
  readonly cyclePulses: number;
  readonly pulsePeriodSeconds: number;
  /** Zero-based position of the last tracked beat, or null when unanchored. */
  readonly phasePulses: number | null;
  /** Not inferred from audio; null unless explicitly supplied. */
  readonly denominator: number | null;
}

export interface MeterCandidate {
  readonly model: MeterModel;
  /** Uncalibrated model strength, not a probability. */
  readonly score: number;
}

export type MeterEstimateReason =
  'acquiring' | 'insufficientEvidence' | 'lowContrast' | 'ambiguousCycle' | 'ambiguousPhase' | 'available' | 'expired';

export interface MeterEstimate {
  readonly selected: MeterModel | null;
  /** At most two distinct cycle models, ordered by score. */
  readonly alternatives: readonly MeterCandidate[];
  /** Uncalibrated strength of the leading model, not a probability. */
  readonly score: number;
  readonly reason: MeterEstimateReason;
  readonly origin: 'estimated' | 'manual' | 'convention';
  /** Audio-context time through which observations were processed. */
  readonly evidenceThroughAudioTime: number;
  /** Audio-context time at which this view loses support without new evidence. */
  readonly validUntilAudioTime: number;
}

/** Manual counting context; phase anchors at the first tracked beat after reset. */
export interface ManualMeter {
  /** Integer from 1 through 32. */
  readonly cyclePulses: number;
  /** Null or omitted leaves phase unknown. */
  readonly phasePulses?: number | null;
  /** A power of two from 1 through 128, or null when unspecified. */
  readonly denominator?: number | null;
}
