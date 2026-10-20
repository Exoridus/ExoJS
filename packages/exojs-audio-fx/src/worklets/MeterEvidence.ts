import type { MeterEstimateReason } from '../meterTypes';
import { type MeterModelParameters, meterModelParameters } from './meterModelParameters';
import type { OnsetEvidenceRing } from './OnsetEvidenceRing';

export class MeterEvidence {
  public cyclePulses: 0 | 3 | 4 = 0;
  public phasePulses: number | null = null;
  public score = 0;
  public reason: MeterEstimateReason = 'acquiring';
  public readonly candidateScores = new Float64Array(2);
  public readonly candidatePhases = new Int8Array(2).fill(-1);
  public evidenceThroughSample = 0;
  public validUntilSample = 0;

  private readonly _indices = new Float64Array(32);
  private readonly _samples = new Float64Array(32);
  private readonly _onsetIds = new Float64Array(32);
  private readonly _features = new Float64Array(128).fill(NaN);
  private readonly _values = new Float64Array(128).fill(NaN);
  private readonly _scratch = new Float64Array(4);
  private readonly _anchors = new Float64Array(32);
  private readonly _anchorWeights = new Float64Array(32);
  private readonly _channelScores = new Float64Array(8);
  private readonly _featureCounts = new Uint8Array(4);
  private readonly _nullErrors = new Float64Array(4);
  private readonly _active = new Uint8Array(4);
  private readonly _phaseSums = new Float64Array(4);
  private readonly _phaseCounts = new Uint8Array(4);
  private _count = 0;
  private _position = 0;
  private _index = -1;
  private _lastGrid = -1;
  private _period = 0;
  private _offset = 0;
  private _dirty = false;

  public constructor(private readonly _parameters: MeterModelParameters = meterModelParameters) {}

  public reset(): void {
    this.cyclePulses = 0;
    this.phasePulses = null;
    this.score = 0;
    this.reason = 'acquiring';
    this.candidateScores.fill(0);
    this.candidatePhases.fill(-1);
    this.evidenceThroughSample = 0;
    this.validUntilSample = 0;
    this._count = 0;
    this._position = 0;
    this._index = -1;
    this._lastGrid = -1;
    this._period = 0;
    this._offset = 0;
    this._dirty = false;
    this._features.fill(NaN);
  }

  public addBeat(sample: number, period: number, onsetId: number): void {
    if (this._lastGrid >= 0 && sample - this._lastGrid < period * 0.5) {
      return;
    }

    if (this._lastGrid >= 0 && (sample - this._lastGrid > period * 2.5 || Math.abs(period / this._period - 1) > 0.15)) {
      this.reset();
    }

    this._index += this._lastGrid < 0 ? 1 : Math.max(1, Math.round((sample - this._lastGrid) / period));
    this._lastGrid = sample;
    this._period = period;
    this._indices[this._position] = this._index;
    this._samples[this._position] = sample;
    this._onsetIds[this._position] = onsetId;
    this._features.fill(NaN, this._position * 4, this._position * 4 + 4);
    this._position = (this._position + 1) % this._indices.length;
    this._count = Math.min(this._count + 1, this._indices.length);
    this._dirty = true;
  }

  public update(sample: number, onsets: OnsetEvidenceRing, window: number): boolean {
    const previousCycle = this.cyclePulses;
    const previousOffset = this._offset;
    const previousPhaseKnown = this.phasePulses !== null;
    this.evidenceThroughSample = sample;

    if (this.validUntilSample > 0 && sample >= this.validUntilSample) {
      this.cyclePulses = 0;
      this.score = 0;
      this.validUntilSample = 0;
      this.reason = 'expired';
      this.candidateScores.fill(0);
      this.candidatePhases.fill(-1);
    }

    for (let i = 0; i < this._count; i++) {
      if (
        this._onsetIds[i]! > 0 &&
        !Number.isFinite(this._features[i * 4]!) &&
        onsets.accentFeatures(this._onsetIds[i]!, sample, window, this._scratch)
      ) {
        this._features.set(this._scratch, i * 4);
        this._dirty = true;
      }
    }

    if (this._dirty) {
      this._fit(sample, window);
      this._dirty = false;
    }

    this.phasePulses =
      this.cyclePulses > 0 && this.candidatePhases[this.cyclePulses - 3]! >= 0
        ? (((this._index - this._offset) % this.cyclePulses) + this.cyclePulses) % this.cyclePulses
        : null;

    return previousCycle !== this.cyclePulses || previousOffset !== this._offset || previousPhaseKnown !== (this.phasePulses !== null);
  }

  public candidatePhase(cycle: number): number | null {
    const offset = this.candidatePhases[cycle - 3]!;

    return offset < 0 ? null : (((this._index - offset) % cycle) + cycle) % cycle;
  }

  private _fit(sample: number, window: number): void {
    let count = 0;
    let latestSupport = 0;

    for (let i = 0; i < this._count; i++) {
      if (Number.isFinite(this._features[i * 4]!)) {
        count++;
        latestSupport = Math.max(latestSupport, this._samples[i]!);
      }
    }

    this.cyclePulses = 0;
    this.score = 0;
    this.candidateScores.fill(0);
    this.candidatePhases.fill(-1);
    // Cover a missing pulse and the complete attack window of its successor.
    this.validUntilSample = count > 0 ? latestSupport + 2 * this._period + window : 0;

    if (this.validUntilSample > 0 && this.validUntilSample <= sample) {
      this.validUntilSample = 0;
      this.reason = 'expired';

      return;
    }

    if (count < 12) {
      this.reason = 'insufficientEvidence';

      return;
    }

    let active = 0;
    this._active.fill(0);

    for (let feature = 0; feature < 4; feature++) {
      let sum = 0;
      let n = 0;

      for (let i = 0; i < this._count; i++) {
        const value = this._features[i * 4 + feature]!;

        if (Number.isFinite(value)) {
          sum += value;
          n++;
        }
      }

      if (n < 12 || sum <= 0) {
        continue;
      }

      const mean = sum / n;
      sum = 0;
      let squares = 0;

      for (let i = 0; i < this._count; i++) {
        const raw = this._features[i * 4 + feature]!;
        const value = Number.isFinite(raw) ? Math.log1p(raw / mean) : NaN;
        this._values[i * 4 + feature] = value;

        if (Number.isFinite(value)) {
          sum += value;
          squares += value * value;
        }
      }

      const error = Math.max(0, squares - (sum * sum) / n);

      if (error < (0.01 * sum * sum) / n) {
        continue;
      }

      const center = sum / n;
      const scale = Math.sqrt(error / n);

      for (let i = 0; i < this._count; i++) {
        const index = i * 4 + feature;
        this._values[index] = (this._values[index]! - center) / scale;
      }

      this._active[feature] = 1;
      this._featureCounts[feature] = n;
      // A repeated two-pulse pattern is an alias, not evidence of a four-pulse cycle.
      const parityError = this._error(2, feature);
      // Unseen parity positions cannot support a two-position null; use the constant null.
      this._nullErrors[feature] = Number.isFinite(parityError) ? parityError : n;

      if (this._nullErrors[feature]! < 0.01 * n) {
        this._active[feature] = 0;
      } else {
        active++;
      }
    }

    if (active === 0) {
      this.reason = 'lowContrast';

      return;
    }

    let bestCycle: 0 | 3 | 4 = 0;
    let bestScore = 0;
    let secondScore = 0;

    for (let cycle = 3; cycle <= 4; cycle++) {
      let likelihood = 0;
      let prior = 0;

      for (let feature = 0; feature < 4; feature++) {
        if (this._active[feature]) {
          const n = this._featureCounts[feature]!;
          const error = this._error(cycle, feature);
          const strength = Number.isFinite(error) ? 1 - error / this._nullErrors[feature]! - ((cycle - 2) * Math.log(n)) / n : -Infinity;
          this._channelScores[(cycle - 3) * 4 + feature] = strength;
          likelihood += this._parameters.channelPriors[feature]! * Math.exp((strength * count) / 2);
          prior += this._parameters.channelPriors[feature]!;
        }
      }

      // Marginalize channels so an uninformative band cannot veto a consistent attack.
      // Both cycle models use identical channel priors and the same two-pulse null.
      const score = Math.max(0, (Math.log(likelihood / prior) * 2) / count);
      this.candidateScores[cycle - 3] = score;
      this.candidatePhases[cycle - 3] = score > 0 ? this._anchor(cycle) : -1;

      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestCycle = cycle as 3 | 4;
      } else {
        secondScore = Math.max(secondScore, score);
      }
    }

    this.score = bestScore;
    this.reason = bestScore < this._parameters.minimumScore ? 'lowContrast' : 'ambiguousCycle';

    if (bestScore >= this._parameters.minimumScore && bestScore - secondScore >= this._parameters.cycleMargin) {
      this.cyclePulses = bestCycle;
      this._offset = this.candidatePhases[bestCycle - 3]!;
      this.reason = this._offset >= 0 ? 'available' : 'ambiguousPhase';
    }
  }

  private _error(cycle: number, feature: number): number {
    this._phaseSums.fill(0);
    this._phaseCounts.fill(0);
    let squares = 0;

    for (let i = 0; i < this._count; i++) {
      const value = this._values[i * 4 + feature]!;

      if (Number.isFinite(value)) {
        const phase = this._indices[i]! % cycle;
        this._phaseSums[phase] = this._phaseSums[phase]! + value;
        this._phaseCounts[phase] = this._phaseCounts[phase]! + 1;
        squares += value * value;
      }
    }

    for (let phase = 0; phase < cycle; phase++) {
      const n = this._phaseCounts[phase]!;

      if (n < 3) {
        return Infinity;
      }

      squares -= this._phaseSums[phase]! ** 2 / n;
    }

    return Math.max(0, squares);
  }

  private _anchor(cycle: number): number {
    this._anchors.fill(0);
    this._anchorWeights.fill(0);
    let maximum = -Infinity;

    for (let feature = 0; feature < 4; feature++) {
      if (this._active[feature]) {
        maximum = Math.max(maximum, this._channelScores[(cycle - 3) * 4 + feature]!);
      }
    }

    for (let feature = 0; feature < 4; feature++) {
      if (this._active[feature]) {
        const weight =
          this._parameters.channelPriors[feature]! *
          Math.exp(((this._channelScores[(cycle - 3) * 4 + feature]! - maximum) * this._count) / 2);

        for (let i = 0; i < this._count; i++) {
          const value = this._values[i * 4 + feature]!;

          if (Number.isFinite(value)) {
            this._anchors[i] = this._anchors[i]! + weight * value;
            this._anchorWeights[i] = this._anchorWeights[i]! + weight;
          }
        }
      }
    }

    this._phaseSums.fill(0);
    this._phaseCounts.fill(0);

    for (let i = 0; i < this._count; i++) {
      if (this._anchorWeights[i]! > 0) {
        const phase = this._indices[i]! % cycle;
        this._phaseSums[phase] = this._phaseSums[phase]! + this._anchors[i]! / this._anchorWeights[i]!;
        this._phaseCounts[phase] = this._phaseCounts[phase]! + 1;
      }
    }

    let best = -Infinity;
    let second = -Infinity;
    let offset = -1;

    for (let phase = 0; phase < cycle; phase++) {
      const mean = this._phaseSums[phase]! / this._phaseCounts[phase]!;

      if (mean > best) {
        second = best;
        best = mean;
        offset = phase;
      } else {
        second = Math.max(second, mean);
      }
    }

    return best - second >= this._parameters.phaseMargin ? offset : -1;
  }
}
