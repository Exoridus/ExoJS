/**
 * In-place radix-2 Cooley-Tukey FFT.
 *
 * Operates on the supplied real/imag arrays (length must be a power of 2).
 * After the call, real[i] and imag[i] hold the complex spectrum.
 * A Hann window is applied to the input before the transform.
 *
 * These functions are duplicated (as plain JS) inside the beat-detector worklet
 * source string because AudioWorklets cannot import modules.
 */

/** Apply a Hann window in-place to `real`. `imag` is zeroed. */
export function hannWindow(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    real[i]! *= w;
    imag[i] = 0;
  }
}

/** Bit-reversal permutation for length `n` (must be power of 2). */
function bitReverse(real: Float32Array, imag: Float32Array): void {
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
}

/**
 * In-place FFT. `real` and `imag` must have the same length (power of 2).
 * A Hann window is applied to `real` before the transform; `imag` is zeroed.
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  hannWindow(real, imag);
  bitReverse(real, imag);

  const n = real.length;
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const angle = angleStep * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const re = real[i + k + halfLen]! * cos - imag[i + k + halfLen]! * sin;
        const im = real[i + k + halfLen]! * sin + imag[i + k + halfLen]! * cos;
        real[i + k + halfLen] = real[i + k]! - re;
        imag[i + k + halfLen] = imag[i + k]! - im;
        real[i + k]! += re;
        imag[i + k]! += im;
      }
    }
  }
}

/**
 * Compute magnitude spectrum from complex FFT output.
 * Returns a Float32Array of length `n/2` (positive frequencies only).
 */
export function magnitudeSpectrum(real: Float32Array, imag: Float32Array): Float32Array {
  const bins = real.length >> 1;
  const mag = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    mag[i] = Math.sqrt(real[i]! * real[i]! + imag[i]! * imag[i]!);
  }
  return mag;
}
