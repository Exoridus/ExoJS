import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it } from 'vitest';

class SignalBuffer {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly length: number;
  private readonly samples: Float32Array;

  constructor(options: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.sampleRate = options.sampleRate;
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.samples = new Float32Array(options.length);
  }

  getChannelData(): Float32Array {
    return this.samples;
  }
}

const createSignal = (noise: boolean): SignalBuffer => {
  const source = readFileSync(resolve('examples/showcase/audio-visualisation.ts'), 'utf8');
  const ast = ts.createSourceFile('signal.ts', source.slice(0, source.indexOf('\nclass ')), ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter();
  const variables = ast.statements
    .filter(ts.isVariableStatement)
    .map(statement => printer.printNode(ts.EmitHint.Unspecified, statement, ast));
  const context = { AudioBuffer: SignalBuffer, result: undefined, noise };
  runInNewContext(
    ts.transpileModule(`${variables.join('\n')}\nresult = createTestSignal(noise);`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );

  return context.result as unknown as SignalBuffer;
};

const frequency = (buffer: SignalBuffer, seconds: number): number => {
  const samples = buffer.getChannelData();
  const start = Math.round(seconds * buffer.sampleRate);
  const length = Math.round(buffer.sampleRate * 0.1);
  let crossings = 0;

  for (let i = start + 1; i < start + length; i++) {
    if (samples[i - 1]! < 0 && samples[i]! >= 0) {
      crossings++;
    }
  }

  return crossings / 0.1;
};

it('sweeps a continuous mono sine from low to high and back without silent pulses or loop clicks', () => {
  const buffer = createSignal(false);
  const samples = buffer.getChannelData();
  expect(buffer.numberOfChannels).toBe(1);
  expect(buffer.length / buffer.sampleRate).toBe(8);
  expect(frequency(buffer, 0.1)).toBeLessThan(250);
  expect(frequency(buffer, 3.9)).toBeGreaterThan(1900);
  expect(frequency(buffer, 7.8)).toBeLessThan(250);

  for (let start = 0; start < samples.length; start += 4800) {
    const slice = samples.subarray(start, start + 4800);
    const rms = Math.sqrt(slice.reduce((sum, value) => sum + value * value, 0) / slice.length);
    expect(rms).toBeGreaterThan(0.27);
    expect(rms).toBeLessThan(0.3);
  }

  expect(Math.abs(samples[0]! - samples.at(-1)!)).toBeLessThan(0.01);
});

it('keeps comparison noise deterministic and below the sine peak', () => {
  const buffer = createSignal(true);
  const samples = buffer.getChannelData();
  expect(samples).toEqual(createSignal(true).getChannelData());
  expect(Math.max(...samples.subarray(0, 48000))).toBeLessThan(0.21);
  expect(Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)).toBeGreaterThan(0.1);
});
