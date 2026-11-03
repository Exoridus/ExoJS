export const validateVocoderBands = (numBands: number, minHz: number, maxHz: number, bandQ: number): void => {
  if (!Number.isSafeInteger(numBands) || numBands < 1) {
    throw new RangeError('Vocoder numBands must be a positive safe integer.');
  }

  if (!Number.isFinite(minHz) || minHz <= 0 || !Number.isFinite(maxHz) || maxHz < minHz || !Number.isFinite(maxHz / minHz)) {
    throw new RangeError('Vocoder frequencies must be finite with 0 < minHz <= maxHz and a finite maxHz/minHz ratio.');
  }

  if (!Number.isFinite(bandQ) || bandQ <= 0 || !Number.isFinite(1 / (2 * bandQ))) {
    throw new RangeError('Vocoder bandQ must be finite and positive with a finite reciprocal.');
  }
};
