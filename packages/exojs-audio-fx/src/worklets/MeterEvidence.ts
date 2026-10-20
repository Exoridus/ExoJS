import type { OnsetEvidenceRing } from './OnsetEvidenceRing';

export class MeterEvidence {
  public cyclePulses: 0 | 3 | 4 = 0;
  public phasePulses = 0;
  public score = 0;
  public evidenceThroughSample = 0;
  public validUntilSample = 0;

  private readonly _sampleRate: number;
  private readonly _indices = new Float64Array(32);
  private readonly _samples = new Float64Array(32);
  private readonly _onsetIds = new Float64Array(32);
  private readonly _energies = new Float64Array(32);
  private _count = 0;
  private _position = 0;
  private _index = -1;
  private _lastGrid = -1;
  private _period = 0;
  private _offset = 0;
  private _dirty = false;

  public constructor(sampleRate: number) {
    this._sampleRate = sampleRate;
    this._energies.fill(NaN);
  }

  public reset(): void {
    this.cyclePulses = 0;
    this.phasePulses = 0;
    this.score = 0;
    this.evidenceThroughSample = 0;
    this.validUntilSample = 0;
    this._count = 0;
    this._position = 0;
    this._index = -1;
    this._lastGrid = -1;
    this._period = 0;
    this._offset = 0;
    this._dirty = false;
    this._energies.fill(NaN);
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
    this._energies[this._position] = NaN;
    this._position = (this._position + 1) % this._indices.length;
    this._count = Math.min(this._count + 1, this._indices.length);
    this._dirty = true;
  }

  public update(sample: number, onsets: OnsetEvidenceRing, window: number): boolean {
    const previousCycle = this.cyclePulses;
    const previousOffset = this._offset;
    this.evidenceThroughSample = sample;

    if (this.validUntilSample > 0 && sample >= this.validUntilSample) {
      this.cyclePulses = 0;
      this.score = 0;
      this.validUntilSample = 0;
    }

    for (let i = 0; i < this._count; i++) {
      if (this._onsetIds[i]! > 0 && !Number.isFinite(this._energies[i]!)) {
        const energy = onsets.accent(this._onsetIds[i]!, sample, window);

        if (energy !== null && Number.isFinite(energy)) {
          this._energies[i] = energy;
          this._dirty = true;
        }
      }
    }

    if (this._dirty) {
      this._fit(sample);
      this._dirty = false;
    }

    this.phasePulses = this.cyclePulses > 0 ? (((this._index - this._offset) % this.cyclePulses) + this.cyclePulses) % this.cyclePulses : 0;

    return previousCycle !== this.cyclePulses || previousOffset !== this._offset;
  }

  private _fit(sample: number): void {
    let sum = 0;
    let squares = 0;
    let count = 0;
    let latestSupport = 0;

    for (let i = 0; i < this._count; i++) {
      const energy = this._energies[i]!;

      if (Number.isFinite(energy)) {
        sum += energy;
        squares += energy * energy;
        count++;
        latestSupport = Math.max(latestSupport, this._samples[i]!);
      }
    }

    this.cyclePulses = 0;
    this.score = 0;
    this.validUntilSample = 0;

    const nullError = count > 0 ? Math.max(0, squares - (sum * sum) / count) : 0;

    if (count < 12 || sum <= 0 || nullError < (sum * sum * 0.01) / count) {
      return;
    }

    let bestScore = 0;
    let secondModelScore = 0;
    let bestCycle: 0 | 3 | 4 = 0;
    let bestOffset = 0;

    for (let cycle = 3; cycle <= 4; cycle++) {
      let modelScore = 0;
      let modelOffset = 0;

      for (let phase = 0; phase < cycle; phase++) {
        let downSum = 0;
        let downCount = 0;

        for (let i = 0; i < this._count; i++) {
          if (Number.isFinite(this._energies[i]!) && this._indices[i]! % cycle === phase) {
            downSum += this._energies[i]!;
            downCount++;
          }
        }

        const otherCount = count - downCount;
        const otherSum = sum - downSum;

        if (downCount < 3 || otherCount < 6 || downSum / downCount <= otherSum / otherCount) {
          continue;
        }

        // Both models fit the same observations and two means against one null.
        // Penalize phase search instead of comparing differently sized posteriors.
        const explained = (downSum * downSum) / downCount + (otherSum * otherSum) / otherCount - (sum * sum) / count;
        const score = explained / nullError - Math.log(cycle) / count;

        if (score > modelScore) {
          modelScore = score;
          modelOffset = phase;
        }
      }

      if (modelScore > bestScore) {
        secondModelScore = bestScore;
        bestScore = modelScore;
        bestCycle = cycle as 3 | 4;
        bestOffset = modelOffset;
      } else {
        secondModelScore = Math.max(secondModelScore, modelScore);
      }
    }

    const expiry = latestSupport + Math.min(2 * this._period, this._sampleRate);

    if (bestScore >= 0.5 && bestScore - secondModelScore >= 0.15 && expiry > sample) {
      this.cyclePulses = bestCycle;
      this._offset = bestOffset;
      this.score = bestScore;
      this.validUntilSample = expiry;
    }
  }
}
