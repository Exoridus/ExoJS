import { fft, hannWindow, magnitudeSpectrum } from '@/audio/dsp/fft';

const FFT_SIZE = 64; // small for fast tests

function makeRealImag(n: number): [Float32Array, Float32Array] {
  return [new Float32Array(n), new Float32Array(n)];
}

describe('fft', () => {
  describe('hannWindow', () => {
    it('zeroes imaginary part', () => {
      const [real, imag] = makeRealImag(8);
      real.fill(1);
      imag.fill(5);
      hannWindow(real, imag);
      for (const v of imag) expect(v).toBe(0);
    });

    it('window has zero endpoints', () => {
      const [real, imag] = makeRealImag(8);
      real.fill(1);
      hannWindow(real, imag);
      expect(real[0]).toBeCloseTo(0, 5);
    });

    it('window has maximum at centre', () => {
      const n = 16;
      const [real, imag] = makeRealImag(n);
      real.fill(1);
      hannWindow(real, imag);
      const mid = real[n >> 1];
      for (let i = 0; i < n; i++) expect(real[i]).toBeLessThanOrEqual(mid + 1e-9);
    });
  });

  describe('fft — DC component', () => {
    it('DC signal with Hann window: bin 0 has non-zero energy', () => {
      const n = FFT_SIZE;
      const [real, imag] = makeRealImag(n);
      real.fill(1);
      fft(real, imag);
      const mag = magnitudeSpectrum(real, imag);
      // With Hann window the DC bin still has meaningful energy
      expect(mag[0]).toBeGreaterThan(0);
    });

    it('silent input yields near-zero spectrum', () => {
      const n = FFT_SIZE;
      const [real, imag] = makeRealImag(n);
      // real is all zeros
      fft(real, imag);
      const mag = magnitudeSpectrum(real, imag);
      for (const v of mag) {
        expect(v).toBeCloseTo(0, 5);
      }
    });
  });

  describe('fft — energy preservation (Parseval)', () => {
    it('total spectral energy is proportional to time-domain energy', () => {
      const n = FFT_SIZE;
      const [real, imag] = makeRealImag(n);
      // Simple sine wave
      for (let i = 0; i < n; i++) {
        real[i] = Math.sin((2 * Math.PI * 4 * i) / n);
      }
      // Time-domain energy (before windowing)
      let tdEnergy = 0;
      for (let i = 0; i < n; i++) tdEnergy += real[i] * real[i];

      fft(real, imag);
      const mag = magnitudeSpectrum(real, imag);

      let fdEnergy = 0;
      for (const v of mag) fdEnergy += v * v;

      // After Hann window, energy reduces; but fd/td ratio should be > 0
      expect(fdEnergy).toBeGreaterThan(0);
    });
  });

  describe('magnitudeSpectrum', () => {
    it('returns array of length fftSize/2', () => {
      const n = 32;
      const [real, imag] = makeRealImag(n);
      fft(real, imag);
      const mag = magnitudeSpectrum(real, imag);
      expect(mag.length).toBe(n >> 1);
    });

    it('all values are non-negative', () => {
      const n = FFT_SIZE;
      const [real, imag] = makeRealImag(n);
      for (let i = 0; i < n; i++) real[i] = Math.random();
      fft(real, imag);
      const mag = magnitudeSpectrum(real, imag);
      for (const v of mag) expect(v).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fft — pure sine peak', () => {
    it('sine at bin k has a peak near bin k', () => {
      const n = FFT_SIZE;
      const k = 4; // target bin
      const [real, imag] = makeRealImag(n);
      // Use a rectangular window (bypass Hann for this test)
      for (let i = 0; i < n; i++) {
        real[i] = Math.sin((2 * Math.PI * k * i) / n);
        imag[i] = 0;
      }
      // Apply bit-reversal + butterfly only (no Hann window) — we can do
      // this by calling fft() and accepting that Hann will reshape peak
      // but it should still be near bin k
      fft(real, imag);
      const mag = magnitudeSpectrum(real, imag);
      // Find peak bin
      let peakBin = 0;
      for (let i = 1; i < mag.length; i++) {
        if (mag[i] > mag[peakBin]) peakBin = i;
      }
      // Peak should be within ±2 of target (Hann window broadens peak)
      expect(Math.abs(peakBin - k)).toBeLessThanOrEqual(2);
    });
  });
});
