/** Keeps raw and normalized onset observations together without per-query allocation. */
export class OnsetEvidenceRing {
  /** Borrowed view, overwritten by the next query or reset. */
  public readonly selected = { id: 0, sample: 0, rawFlux: 0, strength: 0 };
  public count = 0;
  private readonly _samples = new Float64Array(16);
  private readonly _flux = new Float64Array(16);
  private readonly _strengths = new Float32Array(16);
  private readonly _ids = new Float64Array(16);
  private readonly _powers = new Float64Array(16);
  private readonly _bands = new Float64Array(48).fill(NaN);
  private _position = 0;
  private _id = 0;

  public push(sample: number, rawFlux: number, strength: number): void {
    this._samples[this._position] = sample;
    this._flux[this._position] = rawFlux;
    this._strengths[this._position] = strength;
    this._ids[this._position] = ++this._id;
    this._powers[this._position] = 0;
    this._bands.fill(NaN, this._position * 3, this._position * 3 + 3);
    this._position = (this._position + 1) % this._samples.length;
    this.count = Math.min(this.count + 1, this._samples.length);
  }

  public observePower(sample: number, power: number, window: number, bands?: Float64Array): void {
    for (let i = 0; i < this.count; i++) {
      if (sample >= this._samples[i]! && sample - this._samples[i]! <= window) {
        this._powers[i] = Math.max(this._powers[i]!, power);

        if (bands) {
          for (let band = 0; band < 3; band++) {
            const index = i * 3 + band;
            this._bands[index] = Math.max(Number.isFinite(this._bands[index]!) ? this._bands[index]! : 0, bands[band]!);
          }
        }
      }
    }
  }

  public accent(id: number, sample: number, window: number): number | null {
    for (let i = 0; i < this.count; i++) {
      if (this._ids[i] === id && sample - this._samples[i]! >= window) {
        return this._powers[i]!;
      }
    }

    return null;
  }

  public accentFeatures(id: number, sample: number, window: number, into: Float64Array): boolean {
    for (let i = 0; i < this.count; i++) {
      if (this._ids[i] === id && sample - this._samples[i]! >= window) {
        into[0] = this._powers[i]!;

        for (let band = 0; band < 3; band++) {
          into[band + 1] = this._bands[i * 3 + band]!;
        }

        return true;
      }
    }

    return false;
  }

  public nearest(target: number, window: number): number {
    let index = -1;
    let distance = window + 1;

    for (let i = 0; i < this.count; i++) {
      const next = Math.abs(this._samples[i]! - target);

      if (next <= window && next < distance) {
        distance = next;
        index = i;
      }
    }

    return this._select(index);
  }

  public bootstrap(now: number, maxAge: number): number {
    let index = -1;
    let strength = -1;
    let sample = -1;

    for (let i = 0; i < this.count; i++) {
      const nextSample = this._samples[i]!;
      const nextStrength = this._strengths[i]!;

      if (now - nextSample <= maxAge && (nextStrength > strength || (nextStrength === strength && nextSample > sample))) {
        sample = nextSample;
        strength = nextStrength;
        index = i;
      }
    }

    return this._select(index);
  }

  public reset(): void {
    this.count = 0;
    this._position = 0;
    this._select(-1);
  }

  private _select(index: number): number {
    this.selected.id = index >= 0 ? this._ids[index]! : 0;
    this.selected.sample = index >= 0 ? this._samples[index]! : 0;
    this.selected.rawFlux = index >= 0 ? this._flux[index]! : 0;
    this.selected.strength = index >= 0 ? this._strengths[index]! : 0;

    return index >= 0 ? this.selected.sample : -1;
  }
}
