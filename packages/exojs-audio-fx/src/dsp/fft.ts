/**
 * In-place radix-2 Cooley-Tukey FFT.
 *
 * Operates on the supplied real/imag arrays (length must be a power of 2).
 * After the call, real[i] and imag[i] hold the complex spectrum.
 * A Hann window is applied to the input before the transform.
 *
 * The beat-detector worklet imports these directly; its build bundles them in.
 */

/** Apply a Hann window in-place to `real`. `imag` is zeroed. */
export const hannWindow = (real: Float32Array, imag: Float32Array): void => {
  const n = real.length;

  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    real[i]! *= w;
    imag[i] = 0;
  }
};

/** Bit-reversal permutation for length `n` (must be power of 2). */
const bitReverse = (real: Float32Array, imag: Float32Array): void => {
  const n = real.length;
  let j = 0;

  for (let i = 1; i < n; i++) {
    let bit = n >> 1;

    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }

    j ^= bit;

    if (i < j) {
      let tmp = real[i]!;
      real[i] = real[j]!;
      real[j] = tmp;
      tmp = imag[i]!;
      imag[i] = imag[j]!;
      imag[j] = tmp;
    }
  }
};

/**
 * In-place FFT. `real` and `imag` must have the same length (power of 2).
 * A Hann window is applied to `real` before the transform; `imag` is zeroed.
 */
export const fft = (real: Float32Array, imag: Float32Array): void => {
  hannWindow(real, imag);
  bitReverse(real, imag);

  const n = real.length;

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;

    // Twiddle-outer order: the trig pair depends on k only, so it is evaluated
    // halfLen times per stage instead of once per butterfly.
    for (let k = 0; k < halfLen; k++) {
      const angle = angleStep * k;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      for (let i = k; i < n; i += len) {
        const j = i + halfLen;
        const re = real[j]! * cos - imag[j]! * sin;
        const im = real[j]! * sin + imag[j]! * cos;
        real[j] = real[i]! - re;
        imag[j] = imag[i]! - im;
        real[i]! += re;
        imag[i]! += im;
      }
    }
  }
};

/**
 * Compute magnitude spectrum from complex FFT output.
 * Returns a Float32Array of length `n/2` (positive frequencies only).
 */
export const magnitudeSpectrum = (real: Float32Array, imag: Float32Array): Float32Array => {
  const bins = real.length >> 1;
  const mag = new Float32Array(bins);

  for (let i = 0; i < bins; i++) {
    mag[i] = Math.sqrt(real[i]! * real[i]! + imag[i]! * imag[i]!);
  }

  return mag;
};
