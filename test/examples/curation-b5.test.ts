import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it } from 'vitest';

class TestBuffer {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly length: number;
  private readonly samples: Float32Array;

  constructor(options: { length: number; sampleRate: number; numberOfChannels: number }) {
    Object.assign(this, options);
    this.numberOfChannels = options.numberOfChannels;
    this.sampleRate = options.sampleRate;
    this.length = options.length;
    this.samples = new Float32Array(options.length);
  }

  getChannelData(): Float32Array {
    return this.samples;
  }
}

const helpers = <T>(file: string, names: string): T => {
  const source = readFileSync(resolve('examples', `${file}.ts`), 'utf8');
  const beforeScene = source.slice(0, source.indexOf('\nclass '));
  const ast = ts.createSourceFile('fixture.ts', beforeScene, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter();
  const variables = ast.statements
    .filter(ts.isVariableStatement)
    .map(statement => printer.printNode(ts.EmitHint.Unspecified, statement, ast))
    .join('\n');
  const js = ts.transpileModule(`${variables}\nresult = { ${names} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { AudioBuffer: TestBuffer, result: undefined };
  runInNewContext(js, context);

  return context.result as T;
};

it('produces deterministic mono pulse/noise with headroom and different spectral material', () => {
  const { createTestSignal } = helpers<{ createTestSignal(noise: boolean): TestBuffer }>(
    'showcase/audio-visualisation',
    'createTestSignal',
  );
  const pulse = createTestSignal(false),
    noise = createTestSignal(true);
  expect(pulse.numberOfChannels).toBe(1);
  expect(noise.numberOfChannels).toBe(1);
  expect(pulse.length).toBe(48000);
  expect(pulse.sampleRate).toBe(48000);
  expect(noise.getChannelData()).toEqual(createTestSignal(true).getChannelData());

  for (const buffer of [pulse, noise]) {
    const values = buffer.getChannelData();
    let peak = 0,
      energy = 0;

    for (const sample of values) {
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }

    expect(peak).toBeLessThan(0.5);
    expect(Math.sqrt(energy / values.length)).toBeGreaterThan(0.04);
  }

  expect(pulse.getChannelData()[12000]).toBe(0);
  expect(noise.getChannelData()[12000]).not.toBe(0);
});

it('keeps near gain at unity and makes all three distance models distinguishable', () => {
  const { attenuation } = helpers<{ attenuation(model: string, distance: number): number }>(
    'spatial-audio/listener-and-source',
    'attenuation',
  );
  const models = ['linear', 'inverse', 'exponential'];
  const levels = models.map(model => attenuation(model, 400));
  expect(new Set(levels.map(level => level.toFixed(3))).size).toBe(3);

  for (const model of models) {
    expect(attenuation(model, 0)).toBe(1);
    expect(attenuation(model, 50)).toBe(1);
    expect(attenuation(model, 400)).toBeLessThan(attenuation(model, 100));
    expect(attenuation(model, 10000)).toBe(attenuation(model, 560));
  }
});

it('keeps spatial bursts mono, reproducible, and below full scale', () => {
  const { createPulseLoop } = helpers<{ createPulseLoop(): TestBuffer }>('spatial-audio/listener-and-source', 'createPulseLoop');
  const buffer = createPulseLoop();
  expect(buffer.numberOfChannels).toBe(1);
  expect(buffer.getChannelData()).toEqual(createPulseLoop().getChannelData());
  let peak = 0;

  for (const sample of buffer.getChannelData()) {
    peak = Math.max(peak, Math.abs(sample));
  }

  expect(peak).toBeGreaterThan(0.3);
  expect(peak * 0.3).toBeLessThan(0.5);
});
