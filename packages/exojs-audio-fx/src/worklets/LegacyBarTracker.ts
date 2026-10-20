export class LegacyBarTracker {
  public readonly posterior4 = new Float32Array([0.25, 0.25, 0.25, 0.25]);
  public readonly posterior3 = new Float32Array([1 / 3, 1 / 3, 1 / 3]);
  public ts4Confidence = 0.5;
  public ts3Confidence = 0.5;
  public activeTs: '3/4' | '4/4' = '4/4';
  public sustainCounter = 0;
  public barPosition = 1;
  public barNumber = 0;
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

    // --- 4/4 posterior ---
    const p4 = this.posterior4;
    const s4 = new Float32Array(4);
    s4[0] = p4[3]!;
    s4[1] = p4[0]!;
    s4[2] = p4[1]!;
    s4[3] = p4[2]!;
    let sum4 = 0;

    for (let i = 0; i < 4; i++) {
      p4[i] = s4[i]! * (likelihood + (i === 0 ? 0.3 : 0));
      sum4 += p4[i]!;
    }

    if (sum4 > 0) {
      for (let i = 0; i < 4; i++) {
        p4[i]! /= sum4;
      }
    }

    // --- 3/4 posterior ---
    const p3 = this.posterior3;
    const s3 = new Float32Array(3);
    s3[0] = p3[2]!;
    s3[1] = p3[0]!;
    s3[2] = p3[1]!;
    let sum3 = 0;

    for (let i = 0; i < 3; i++) {
      p3[i] = s3[i]! * (likelihood + (i === 0 ? 0.3 : 0));
      sum3 += p3[i]!;
    }

    if (sum3 > 0) {
      for (let i = 0; i < 3; i++) {
        p3[i]! /= sum3;
      }
    }

    // --- Update TS confidences (EMA) ---
    let max4 = 0;

    for (let i = 0; i < 4; i++) {
      if (p4[i]! > max4) {
        max4 = p4[i]!;
      }
    }

    let max3 = 0;

    for (let i = 0; i < 3; i++) {
      if (p3[i]! > max3) {
        max3 = p3[i]!;
      }
    }

    const alpha = 0.1;
    this.ts4Confidence = (1 - alpha) * this.ts4Confidence + alpha * max4;
    this.ts3Confidence = (1 - alpha) * this.ts3Confidence + alpha * max3;

    // --- Hysteresis switching ---
    if (this.enableTsDetection && this.beatsSinceStart > 8) {
      const minSwitchMargin = 1.4;
      const minSustainBeats = 12; // ~4 bars * 3 beats
      const threeFavored = this.ts3Confidence > this.ts4Confidence * minSwitchMargin;
      const fourFavored = this.ts4Confidence > this.ts3Confidence * minSwitchMargin;

      if (this.activeTs === '4/4' && threeFavored) {
        this.sustainCounter++;

        if (this.sustainCounter >= minSustainBeats) {
          this.activeTs = '3/4';
          this.sustainCounter = 0;
        }
      } else if (this.activeTs === '3/4' && fourFavored) {
        this.sustainCounter++;

        if (this.sustainCounter >= minSustainBeats + 4) {
          // 16 beats for 4/4
          this.activeTs = '4/4';
          this.sustainCounter = 0;
        }
      } else {
        this.sustainCounter = 0;
      }
    }

    // --- Determine bar position from active TS ---
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

      const newPos = maxI + 1; // 1-indexed

      if (newPos === 1 && this.barPosition !== 1) {
        this.barNumber++;
      }

      this.barPosition = newPos;
    } else {
      // Just advance sequentially
      this.barPosition = (this.barPosition % barLen) + 1;

      if (this.barPosition === 1) {
        this.barNumber++;
      }
    }
  }
}
