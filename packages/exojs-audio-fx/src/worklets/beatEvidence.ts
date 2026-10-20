export interface BeatEvidence {
  epoch: number;
  beatId: number;
  gridSample: number;
  emittedAtSample: number;
  periodSamples: number;
  onsetId: number;
  onsetSample: number | null;
  rawFlux: number | null;
  normalizedStrength: number | null;
  beatConfidence: number;
}

export interface OnsetEvidence {
  id: number;
  sample: number;
  rawFlux: number;
  strength: number;
}

export const captureBeatEvidence = (
  evidence: BeatEvidence,
  epoch: number,
  gridSample: number,
  emittedAtSample: number,
  periodSamples: number,
  onset: OnsetEvidence,
): void => {
  evidence.epoch = epoch;
  evidence.beatId++;
  evidence.gridSample = gridSample;
  evidence.emittedAtSample = emittedAtSample;
  evidence.periodSamples = periodSamples;
  evidence.onsetId = onset.id;
  evidence.onsetSample = onset.id > 0 ? onset.sample : null;
  evidence.rawFlux = onset.id > 0 ? onset.rawFlux : null;
  evidence.normalizedStrength = onset.id > 0 ? onset.strength : null;
};

export const createBeatEvidence = (): BeatEvidence => ({
  epoch: 0,
  beatId: 0,
  gridSample: 0,
  emittedAtSample: 0,
  periodSamples: 0,
  onsetId: 0,
  onsetSample: null,
  rawFlux: null,
  normalizedStrength: null,
  beatConfidence: 0,
});

export const resetBeatEvidence = (evidence: BeatEvidence, epoch: number): void => {
  evidence.epoch = epoch;
  evidence.gridSample = 0;
  evidence.emittedAtSample = 0;
  evidence.periodSamples = 0;
  evidence.onsetId = 0;
  evidence.onsetSample = null;
  evidence.rawFlux = null;
  evidence.normalizedStrength = null;
  evidence.beatConfidence = 0;
};
