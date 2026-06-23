/**
 * Mel-scale filterbank generator.
 *
 * Generates `numBands` triangular filters log-spaced from `fMin` to `fMax` Hz
 * on the mel scale. Each filter is a typed array of weights for the FFT
 * magnitude bins.
 *
 * These helpers are also inlined inside the beat-detector worklet source
 * string (worklets cannot import modules).
 */

/** Convert Hz to mel. */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/** Convert mel to Hz. */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

export interface MelBand {
  /** Index of the FFT bin where this filter starts (weight 0). */
  readonly startBin: number;
  /** Index of the peak FFT bin (weight 1). */
  readonly peakBin: number;
  /** Index of the FFT bin where this filter ends (weight 0). */
  readonly endBin: number;
  /** Pre-computed triangular weights, indexed from startBin..endBin (inclusive). */
  readonly weights: Float32Array;
}

/**
 * Build a mel filterbank.
 *
 * @param numBands   Number of mel bands (default 24).
 * @param fMin       Lowest frequency in Hz (default 80).
 * @param fMax       Highest frequency in Hz (default 8000).
 * @param fftSize    Number of FFT points (e.g., 2048).
 * @param sampleRate Audio sample rate in Hz (e.g., 48000).
 */
export function buildMelFilterbank(bandCount: number, fMin: number, fMax: number, fftSize: number, sampleRate: number): MelBand[] {
  const binCount = fftSize >> 1; // positive frequencies
  const nyquist = sampleRate / 2;

  // Equally-spaced mel points: bandCount+2 points spanning fMin..fMax
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);
  const melPoints = new Float32Array(bandCount + 2);
  for (let i = 0; i < bandCount + 2; i++) {
    melPoints[i] = melMin + ((melMax - melMin) * i) / (bandCount + 1);
  }

  // Convert mel points to FFT bin indices
  const binPoints = new Float32Array(bandCount + 2);
  for (let i = 0; i < bandCount + 2; i++) {
    const hz = melToHz(melPoints[i]!);
    binPoints[i] = Math.round((hz / nyquist) * (binCount - 1));
  }

  const bands: MelBand[] = [];
  for (let b = 0; b < bandCount; b++) {
    const startBin = Math.max(0, Math.min(binCount - 1, binPoints[b]!));
    const peakBin = Math.max(0, Math.min(binCount - 1, binPoints[b + 1]!));
    const endBin = Math.max(0, Math.min(binCount - 1, binPoints[b + 2]!));

    const len = endBin - startBin + 1;
    const weights = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const bin = startBin + i;
      if (bin <= peakBin && peakBin > startBin) {
        weights[i] = (bin - startBin) / (peakBin - startBin);
      } else if (bin > peakBin && endBin > peakBin) {
        weights[i] = (endBin - bin) / (endBin - peakBin);
      } else {
        // Degenerate: startBin === peakBin === endBin
        weights[i] = 1;
      }
    }

    bands.push({ startBin, peakBin, endBin, weights });
  }

  return bands;
}

/**
 * Compute mel band energies from a magnitude spectrum.
 *
 * @param mag     FFT magnitude spectrum (length = fftSize/2).
 * @param bands   Filterbank from `buildMelFilterbank`.
 * @param out     Optional pre-allocated output array of length `bands.length`.
 * @returns       Log-compressed mel band energies.
 */
export function computeMelBands(mag: Float32Array, bands: MelBand[], out?: Float32Array): Float32Array {
  const result = out ?? new Float32Array(bands.length);
  for (let b = 0; b < bands.length; b++) {
    const { startBin, weights } = bands[b]!;
    let energy = 0;
    for (let i = 0; i < weights.length; i++) {
      energy += mag[startBin + i]! * weights[i]!;
    }
    result[b] = Math.log(1 + energy);
  }
  return result;
}
