export class LegacyBarTracker {
  public readonly posterior4 = new Float32Array([0.25, 0.25, 0.25, 0.25]);
  public readonly posterior3 = new Float32Array([1 / 3, 1 / 3, 1 / 3]);
  public ts4Confidence = 0.5;
  public ts3Confidence = 0.5;
  public activeTs: '3/4' | '4/4' = '4/4';
  public sustainCounter = 0;
  public barPosition = 1;
  public beatsSinceStart = 0;

  public constructor(private readonly enableTsDetection: boolean) {}

  public reset(): void {
    this.posterior4.fill(0.25);
    this.posterior3.fill(1 / 3);
    this.ts4Confidence = 0.5;
    this.ts3Confidence = 0.5;
    this.activeTs = '4/4';
    this.sustainCounter = 0;
    this.barPosition = 1;
    this.beatsSinceStart = 0;
  }

  public update(likelihood: number): void {
    this.beatsSinceStart++;

    const p4 = this.posterior4;
    const p3 = this.posterior3;
    const max4 = this._advance(p4, likelihood);
    const max3 = this._advance(p3, likelihood);
    const alpha = 0.1;
    this.ts4Confidence = (1 - alpha) * this.ts4Confidence + alpha * max4;
    this.ts3Confidence = (1 - alpha) * this.ts3Confidence + alpha * max3;

    const favorThree = this.activeTs === '4/4';
    const favored = favorThree ? this.ts3Confidence > this.ts4Confidence * 1.4 : this.ts4Confidence > this.ts3Confidence * 1.4;

    if (this.enableTsDetection && this.beatsSinceStart > 8 && favored) {
      if (++this.sustainCounter >= (favorThree ? 12 : 16)) {
        this.activeTs = favorThree ? '3/4' : '4/4';
        this.sustainCounter = 0;
      }
    } else {
      this.sustainCounter = 0;
    }

    const barLen = this.activeTs === '3/4' ? 3 : 4;
    const posterior = this.activeTs === '3/4' ? p3 : p4;

    if (this.beatsSinceStart >= barLen) {
      let maxP = -1;
      let maxI = 0;

      for (let i = 0; i < barLen; i++) {
        if (posterior[i]! > maxP) {
          maxP = posterior[i]!;
          maxI = i;
        }
      }

      this.barPosition = maxI + 1;
    } else {
      this.barPosition = (this.barPosition % barLen) + 1;
    }
  }

  private _advance(posterior: Float32Array, likelihood: number): number {
    let previous = posterior[posterior.length - 1]!;
    let sum = 0;

    for (let i = 0; i < posterior.length; i++) {
      const next = posterior[i]!;
      posterior[i] = previous * (likelihood + (i === 0 ? 0.3 : 0));
      sum += posterior[i]!;
      previous = next;
    }

    let max = 0;

    for (let i = 0; i < posterior.length; i++) {
      if (sum > 0) {
        posterior[i]! /= sum;
      }

      if (posterior[i]! > max) {
        max = posterior[i]!;
      }
    }

    return max;
  }
}
