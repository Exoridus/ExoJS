/**
 * Acoustic contract for the Vocoder worklet in real Web Audio. The vocoder has
 * two inputs (carrier + modulator), so it renders through a dedicated graph
 * here. Asserts the two properties that matter for the shipped bug class: the
 * bandCount make-up gain keeps the output audible (the old build was -23.8 dB),
 * and the spectral envelope follows the modulator's formant.
 */

import { vocoderWorkletSource } from '../../src/worklets/vocoder.worklet';
import { rms, SAMPLE_RATE, tail } from './_audio-harness';

interface VocoderRenderOptions {
  carrierType: OscillatorType;
  carrierFreq: number;
  modFreq: number;
  durationSeconds: number;
}

async function renderVocoder(opts: VocoderRenderOptions): Promise<Float32Array> {
  const sr = SAMPLE_RATE;
  const ctx = new OfflineAudioContext(1, Math.floor(opts.durationSeconds * sr), sr);

  const url = URL.createObjectURL(new Blob([vocoderWorkletSource], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const node = new AudioWorkletNode(ctx, 'exojs-vocoder', {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    processorOptions: { numBands: 16, minHz: 80, maxHz: 8000, bandQ: 4 },
  });
  node.parameters.get('envelopeSmoothing')!.value = 0.005;

  const carrier = ctx.createOscillator();
  carrier.type = opts.carrierType;
  carrier.frequency.value = opts.carrierFreq;
  const modulator = ctx.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.value = opts.modFreq;

  carrier.connect(node, 0, 0); // carrier -> input 0
  modulator.connect(node, 0, 1); // modulator -> input 1
  node.connect(ctx.destination);
  carrier.start();
  modulator.start();

  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

function magnitudeAt(buf: Float32Array, freq: number): number {
  let re = 0;
  let im = 0;
  const omega = (2 * Math.PI * freq) / SAMPLE_RATE;
  for (let i = 0; i < buf.length; i++) {
    re += buf[i] * Math.cos(omega * i);
    im -= buf[i] * Math.sin(omega * i);
  }
  return Math.sqrt(re * re + im * im) / buf.length;
}

describe('Vocoder worklet — real Web Audio', () => {
  it('make-up gain keeps the output audible (not the old -23.8 dB shortfall)', async () => {
    const out = await renderVocoder({
      carrierType: 'sawtooth',
      carrierFreq: 110,
      modFreq: 700,
      durationSeconds: 3,
    });
    // after 2 s the band envelopes have converged; -20 dBFS is the floor below
    // which the vocoder would be effectively inaudible.
    expect(rms(tail(out, 2.0))).toBeGreaterThan(0.05);
  });

  it('spectral envelope follows the modulator formant', async () => {
    // Sawtooth at 110 Hz has harmonics at 660 and 2200 Hz; a 660 Hz modulator
    // should boost the 660 Hz region relative to a 2200 Hz modulator.
    const low = tail(await renderVocoder({ carrierType: 'sawtooth', carrierFreq: 110, modFreq: 660, durationSeconds: 3 }), 2.0);
    const high = tail(await renderVocoder({ carrierType: 'sawtooth', carrierFreq: 110, modFreq: 2200, durationSeconds: 3 }), 2.0);

    const lowRatio = magnitudeAt(low, 660) / (magnitudeAt(low, 2200) + 1e-9);
    const highRatio = magnitudeAt(high, 660) / (magnitudeAt(high, 2200) + 1e-9);
    // the 660 Hz modulator emphasises 660 relative to 2200 more than the 2200 Hz one does
    expect(lowRatio).toBeGreaterThan(highRatio);
  });

});
