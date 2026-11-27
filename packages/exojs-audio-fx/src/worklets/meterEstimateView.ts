import type { ManualMeter, MeterCandidate, MeterEstimate, MeterModel } from '../meterTypes';
import type { MeterEvidence } from './MeterEvidence';

interface MeterViewContext {
  meter: MeterEvidence;
  manualMeter: ManualMeter | null;
  automatic: boolean;
  settled: boolean;
  meterKnown: boolean;
  cyclePulses: number;
  phasePulses: number;
  periodSeconds: number;
  sampleRate: number;
  sample: number;
  analysisTime: number;
  predictionValidUntilSample: number;
  hasBeat: boolean;
}

export const createMeterEstimate = (context: MeterViewContext): MeterEstimate => {
  const { meter, manualMeter, automatic, settled, analysisTime } = context;
  const model = (cyclePulses: number, phasePulses: number | null): MeterModel => ({
    cyclePulses,
    phasePulses,
    pulsePeriodSeconds: context.periodSeconds,
    denominator: manualMeter?.denominator ?? null,
  });
  let selected: MeterModel | null = null;
  let reason: MeterEstimate['reason'] = 'acquiring';
  let origin: MeterEstimate['origin'] = 'estimated';
  let score = 0;
  let deadline = context.predictionValidUntilSample;

  if (automatic) {
    deadline = Math.min(deadline, meter.validUntilSample);

    if (settled) {
      reason = meter.reason;
      score = meter.score;

      if (meter.cyclePulses > 0) {
        selected = model(meter.cyclePulses, meter.phasePulses);
      }
    }
  } else {
    origin = manualMeter ? 'manual' : 'convention';

    if (settled) {
      selected = model(context.cyclePulses, context.meterKnown ? context.phasePulses : null);
      score = 1;
      reason = context.meterKnown ? 'available' : 'ambiguousPhase';
    }
  }

  if (!settled && context.hasBeat && context.predictionValidUntilSample <= context.sample) {
    reason = 'expired';
  }

  const alternatives: MeterCandidate[] = [];

  if (settled && automatic) {
    for (let cycle = 3; cycle <= 4; cycle++) {
      const candidateScore = meter.candidateScores[cycle - 3]!;

      if (candidateScore > 0) {
        alternatives.push({ model: model(cycle, meter.candidatePhase(cycle)), score: candidateScore });
      }
    }

    alternatives.sort((a, b) => b.score - a.score);
  }

  return {
    selected,
    alternatives,
    score,
    origin,
    reason,
    evidenceThroughAudioTime: analysisTime,
    validUntilAudioTime: deadline > context.sample ? analysisTime + (deadline - context.sample) / context.sampleRate : 0,
  };
};
