/**
 * Channel-topology contract for the per-sample worklet effects in real Web
 * Audio. Each input channel carries its own tone, so a processor that only
 * renders channel 0 leaves the right channel silent, and one that mixes
 * channels leaks a tone into the wrong side.
 */

import bitCrusherWorkletSource from '../../src/worklets/bit-crusher.worklet.ts?worklet';
import granularWorkletSource from '../../src/worklets/granular.worklet.ts?worklet';
import pitchShiftWorkletSource from '../../src/worklets/pitch-shift.worklet.ts?worklet';
import vocoderWorkletSource from '../../src/worklets/vocoder.worklet.ts?worklet';
import { dominantFreq, magnitudeAt, renderWorkletChannels, rms, tail } from './_audio-harness';

const LEFT_HZ = 440;
const RIGHT_HZ = 880;

const expectSeparateTones = (left: Float32Array, right: Float32Array, leftHz: number, rightHz: number): void => {
  expect(rms(right)).toBeGreaterThan(0.1);
  expect(Math.abs(dominantFreq(left) - leftHz)).toBeLessThan(leftHz * 0.02);
  expect(Math.abs(dominantFreq(right) - rightHz)).toBeLessThan(rightHz * 0.02);
  // No crossfeed: each side carries at most a trace of the other side's tone.
  expect(magnitudeAt(left, rightHz)).toBeLessThan(magnitudeAt(left, leftHz) * 0.05);
  expect(magnitudeAt(right, leftHz)).toBeLessThan(magnitudeAt(right, rightHz) * 0.05);
};

const changeIndices = (buf: Float32Array): number[] => {
  const indices: number[] = [];
  for (let i = 1; i < buf.length; i++) if (buf[i] !== buf[i - 1]) indices.push(i);
  return indices;
};

describe('worklet effects keep stereo channels separate', () => {
  it('BitCrusher processes both channels', async () => {
    const [left, right] = await renderWorkletChannels({
      source: bitCrusherWorkletSource,
      processorName: 'exojs-bit-crusher',
      params: { bits: 16, normFreq: 1 },
      channelFreqs: [LEFT_HZ, RIGHT_HZ],
      durationSeconds: 0.5,
    });

    expectSeparateTones(left!, right!, LEFT_HZ, RIGHT_HZ);
  });

  it('BitCrusher latches both channels on the same clock', async () => {
    const [left, right] = await renderWorkletChannels({
      source: bitCrusherWorkletSource,
      processorName: 'exojs-bit-crusher',
      params: { bits: 16, normFreq: 0.1 },
      channelFreqs: [LEFT_HZ, RIGHT_HZ],
      durationSeconds: 0.2,
    });
    const leftChanges = changeIndices(left!);

    expect(leftChanges.length).toBeGreaterThan(100);
    expect(changeIndices(right!)).toEqual(leftChanges);
  });

  it('Granular processes both channels', async () => {
    const [left, right] = await renderWorkletChannels({
      source: granularWorkletSource,
      processorName: 'exojs-granular',
      processorOptions: { bufferSeconds: 1 },
      params: { grainSize: 0.05, density: 40, spread: 0.1, pitchMin: 1, pitchMax: 1 },
      channelFreqs: [LEFT_HZ, RIGHT_HZ],
      durationSeconds: 1,
    });

    expectSeparateTones(tail(left!, 0.3), tail(right!, 0.3), LEFT_HZ, RIGHT_HZ);
  });

  it('PitchShift shifts both channels', async () => {
    const [left, right] = await renderWorkletChannels({
      source: pitchShiftWorkletSource,
      processorName: 'exojs-pitch-shift',
      params: { pitch: 1.5 },
      channelFreqs: [LEFT_HZ, RIGHT_HZ],
      durationSeconds: 1,
    });

    expectSeparateTones(tail(left!, 0.2), tail(right!, 0.2), LEFT_HZ * 1.5, RIGHT_HZ * 1.5);
  });

  it('PitchShift still renders a mono input', async () => {
    const [mono] = await renderWorkletChannels({
      source: pitchShiftWorkletSource,
      processorName: 'exojs-pitch-shift',
      params: { pitch: 2 },
      channelFreqs: [LEFT_HZ],
      durationSeconds: 1,
    });

    expect(Math.abs(dominantFreq(tail(mono!, 0.2)) - LEFT_HZ * 2)).toBeLessThan(LEFT_HZ * 2 * 0.02);
  });

  it('Vocoder applies the shared modulator envelope to each carrier channel', async () => {
    // Carrier harmonics: left 110 Hz (..., 550, 660), right 165 Hz (..., 495, 660).
    // Each of 550 and 495 Hz exists in only one carrier, so it must stay on that side.
    const [left, right] = await renderWorkletChannels({
      source: vocoderWorkletSource,
      processorName: 'exojs-vocoder',
      processorOptions: { numBands: 16, minHz: 80, maxHz: 8000, bandQ: 4 },
      params: { envelopeSmoothing: 0.005 },
      channelFreqs: [110, 165],
      inputType: 'sawtooth',
      modulatorFreq: 660,
      durationSeconds: 3,
    });
    const leftTail = tail(left!, 2);
    const rightTail = tail(right!, 2);

    expect(rms(rightTail)).toBeGreaterThan(0.05);
    expect(magnitudeAt(leftTail, 550)).toBeGreaterThan(magnitudeAt(rightTail, 550) * 10);
    expect(magnitudeAt(rightTail, 495)).toBeGreaterThan(magnitudeAt(leftTail, 495) * 10);
  });
});
