export interface UpcomingBeat {
  audioTime: number;
  tempo: number;
  isDownbeat: boolean;
  beatInBar: number;
  meterKnown?: boolean;
}

export interface BeatSchedule {
  readonly epoch: number;
  readonly revision: number;
  /** Time this forecast revision was generated, not when it reached the caller. */
  readonly generatedAtAudioTime: number;
  /** End of the audio consumed by this forecast revision. */
  readonly evidenceThroughAudioTime: number;
  /** Discard the forecast at this context time without renewed evidence. */
  readonly validUntilAudioTime: number;
  /** Last conditional target; this does not extend validity. */
  readonly horizonAudioTime: number;
  /** Period used to extrapolate this forecast, not a notated note value. */
  readonly pulsePeriodSeconds: number;
  readonly status: 'provisional' | 'locked';
  /** Retained revision entries can include times that have since passed. */
  readonly beats: ReadonlyArray<Readonly<UpcomingBeat>>;
  readonly nextBeat: Readonly<UpcomingBeat> | null;
  /** Null without valid anchored meter or a future boundary within the horizon. */
  readonly nextDownbeat: Readonly<UpcomingBeat> | null;
}
