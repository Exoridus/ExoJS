import {
  acfAtLag,
  candidateEdgeTolerance,
  combPenaltyDouble,
  combPenaltyTriple,
  combWeightFundamental,
  combWeightHalf,
  combWeightThird,
  defaultPriorMu,
  defaultPriorSigma,
  parabolicPeakOffset,
  type TempoCandidateResult,
  tempoPrior,
} from '../dsp/tempogram';

export class TempoCandidateScorer {
  private readonly _rawScores = new Float64Array(3);

  public constructor(
    private readonly _sampleRate: number,
    private readonly _hopSize: number,
    private readonly _minBpm: number,
    private readonly _maxBpm: number,
  ) {}

  public scoreInto(acf: Float32Array, minLag: number, into: TempoCandidateResult[]): number {
    const numLags = acf.length;
    const lastIdx = numLags - 1;
    const loBpm = this._minBpm * (1 - candidateEdgeTolerance);
    const hiBpm = this._maxBpm * (1 + candidateEdgeTolerance);
    let count = 0;

    if (numLags <= 1) {
      return count;
    }

    for (let i = 0; i < numLags; i++) {
      const raw = acf[i]!;

      if (raw <= 0 || (i > 0 && !(raw > acf[i - 1]!)) || (i < lastIdx && !(raw > acf[i + 1]!))) {
        continue;
      }

      const lag = minLag + i + (i > 0 && i < lastIdx ? parabolicPeakOffset(acf[i - 1]!, raw, acf[i + 1]!) : 0);
      const bpm = (60 * this._sampleRate) / (lag * this._hopSize);

      if (bpm < loBpm || bpm > hiBpm) {
        continue;
      }

      const aF = acfAtLag(acf, minLag, lag);
      const aHalf = acfAtLag(acf, minLag, lag * 2);
      const aThird = acfAtLag(acf, minLag, lag * 3);
      const aDouble = acfAtLag(acf, minLag, lag / 2);
      const aTriple = acfAtLag(acf, minLag, lag / 3);
      const support = combWeightFundamental * aF + combWeightHalf * aHalf + combWeightThird * aThird;
      // Energy above the BPM ceiling is a subdivision, not a competing beat.
      const penDbl = bpm * 2 <= hiBpm ? combPenaltyDouble * aDouble : 0;
      const penTrip = bpm * 3 <= hiBpm ? combPenaltyTriple * aTriple : 0;
      let comb = support - penDbl - penTrip;

      if (comb < 0) {
        comb = 0;
      }

      const score = comb * tempoPrior(bpm, defaultPriorMu, defaultPriorSigma);
      let position = 0;

      // Final-score ties retain the raw-peak ranking of the canonical stable sorts.
      while (
        position < count &&
        (into[position]!.score > score || (into[position]!.score === score && this._rawScores[position]! >= raw))
      ) {
        position++;
      }

      if (position < into.length) {
        for (let j = Math.min(count, into.length - 1); j > position; j--) {
          into[j]!.bpm = into[j - 1]!.bpm;
          into[j]!.score = into[j - 1]!.score;
          into[j]!.lag = into[j - 1]!.lag;
          this._rawScores[j] = this._rawScores[j - 1]!;
        }

        into[position]!.bpm = bpm;
        into[position]!.score = score;
        into[position]!.lag = lag;
        this._rawScores[position] = raw;
        count = Math.min(count + 1, into.length);
      }
    }

    return count;
  }
}
