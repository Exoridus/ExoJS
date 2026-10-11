import { createFilterShader, ShaderFilter, UniformType } from '@codexo/exojs';
import { expect } from 'vitest';

import type { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { type ColorTextureFormat, TextureFormat } from '#rendering/types';

import exampleSource from '../../../examples/audio-fx/gpu-pcm-stream.ts?raw';
import pcmStreamWorkletSource from '../../../packages/exojs-audio-fx/src/worklets/pcm-stream.worklet.ts?worklet';
import pcmFenceWorkletSource from '../../../packages/exojs-audio-fx/test/fixtures/pcm-fence.worklet.ts?worklet';
import { driveUntilSettled } from './_pixelReaderDrive';

export const verifyGpuPcm = async (context: RenderingContext, format: ColorTextureFormat): Promise<void> => {
  // Read the catalog's shader bodies so the browser proof cannot silently test a different generator.
  const glsl = /glsl:\s*\{\s*fragment:\s*`([^`]+)`/.exec(exampleSource)?.[1];
  const wgsl = /wgsl:\s*`([^`]+)`/.exec(exampleSource)?.[1];

  if (!glsl || !wgsl) {
    throw new Error('GPU PCM example shader sources were not found.');
  }

  const filter = ShaderFilter.from(
    createFilterShader({
      glsl: { fragment: glsl },
      wgsl,
      uniforms: { sampleOffset: UniformType.Int, sampleRate: UniformType.Float, packed: UniformType.Int },
    }),
  );
  const frames = 1024;
  const blocks = 4;
  const sampleRate = 48000;
  const input = new RenderTexture(1, 1);
  const target = new RenderTexture(frames, 1, { format });
  const reader = context.createPixelReader(target, { slots: 2, dataType: format === TextureFormat.Rgba8 ? 'uint8' : 'float32' });
  const pcm = [new Float32Array(frames * blocks), new Float32Array(frames * blocks)];
  filter.uniforms.sampleRate.set(sampleRate);
  filter.uniforms.packed.set(format === TextureFormat.Rgba8 ? 1 : 0);
  const submittedAt = performance.now();

  try {
    for (let pair = 0; pair < blocks; pair += 2) {
      const pending = [pair, pair + 1].map(block => {
        filter.uniforms.sampleOffset.set(block * frames);
        filter.apply(context.backend, input, target);

        return reader.request()!;
      });
      expect(reader.inFlight).toBe(2);
      expect(reader.request()).toBeNull();
      await driveUntilSettled(context.backend, pending[1]!);

      for (let slot = 0; slot < pending.length; slot++) {
        const read = pending[slot]!;
        expect(read.failed).toBe(false);
        const data = read.data!.data;
        expect(data).toBeInstanceOf(format === TextureFormat.Rgba8 ? Uint8ClampedArray : Float32Array);

        for (let frame = 0; frame < frames; frame++) {
          const index = (pair + slot) * frames + frame;
          pcm[0]![index] =
            format === TextureFormat.Rgba8 ? ((data[frame * 4]! * 256 + data[frame * 4 + 1]!) / 65535) * 2 - 1 : data[frame * 4]!;
          pcm[1]![index] =
            format === TextureFormat.Rgba8 ? ((data[frame * 4 + 2]! * 256 + data[frame * 4 + 3]!) / 65535) * 2 - 1 : data[frame * 4 + 1]!;
        }

        read.release();
      }

      expect(reader.inFlight).toBe(0);
    }

    const readbackMs = performance.now() - submittedAt;
    const rendered = await renderOffline(pcm, sampleRate, frames);
    const tolerance = format === TextureFormat.Rgba16F ? 0.0001 : 0.00004;

    for (let channel = 0; channel < 2; channel++) {
      const actual = rendered.getChannelData(channel);
      const frequency = channel === 0 ? 220 : 330;
      let maxError = 0;

      for (let index = 0; index < frames * blocks; index++) {
        maxError = Math.max(maxError, Math.abs(actual[index + 174]! - Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.12));
      }

      expect(maxError, `${format} channel ${channel}: includes every block boundary`).toBeLessThan(tolerance);
      expect(actual.subarray(0, 174).every(value => value === 0)).toBe(true);
      expect(actual.subarray(174 + frames * blocks).every(value => value === 0)).toBe(true);
    }

    console.info(
      `GPU PCM ${format}: ${frames * blocks} stereo frames, 2 readback slots, ${readbackMs.toFixed(1)} ms generation/readback, sample start 174/48000 s`,
    );
  } finally {
    reader.destroy();
    filter.destroy();
    input.destroy();
    target.destroy();
  }
};

const renderOffline = async (pcm: Float32Array[], sampleRate: number, blockFrames: number): Promise<AudioBuffer> => {
  const frames = pcm[0]!.length;
  const context = new OfflineAudioContext(2, frames + 512, sampleRate);
  const url = URL.createObjectURL(new Blob([pcmFenceWorkletSource, '\n', pcmStreamWorkletSource], { type: 'application/javascript' }));

  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const node = new AudioWorkletNode(context, 'exojs-pcm-stream', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { channels: 2, capacityFrames: frames },
  });
  node.connect(context.destination);
  let resolveFence!: () => void;
  const fence = new Promise<void>(resolve => {
    resolveFence = resolve;
  });
  let resolveEnded!: (value: unknown) => void;
  const ended = new Promise(resolve => {
    resolveEnded = resolve;
  });
  const failed = new Promise<never>((_resolve, reject) => {
    node.onprocessorerror = () => reject(new Error('GPU PCM AudioWorklet failed'));
  });

  node.port.onmessage = event => {
    if (event.data.type === 'test-fence') {
      resolveFence();
    }

    if (event.data.type === 'ended') {
      resolveEnded(event.data);
    }

    if (event.data.type === 'status') {
      node.port.postMessage({ type: 'ack' });
    }
  };

  try {
    for (let offset = 0; offset < frames; offset += blockFrames) {
      const data = new Float32Array(blockFrames * 2);
      data.set(pcm[0]!.subarray(offset, offset + blockFrames));
      data.set(pcm[1]!.subarray(offset, offset + blockFrames), blockFrames);
      node.port.postMessage({ type: 'write', data }, [data.buffer]);
    }

    node.port.postMessage({ type: 'start', time: 173.25 / sampleRate });
    node.port.postMessage({ type: 'close' });
    node.port.postMessage({ type: 'test-fence' });
    await Promise.race([fence, failed]);
    const rendered = await Promise.race([context.startRendering(), failed]);
    expect(await Promise.race([ended, failed])).toEqual({
      type: 'ended',
      releasedFrames: frames,
      playedFrames: frames,
      underrunFrames: 0,
      underruns: 0,
    });

    return rendered;
  } finally {
    node.disconnect();
    node.port.close();
  }
};
