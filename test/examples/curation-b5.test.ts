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

it('mirrors the Web Audio PannerNode distance models for the example parameters', () => {
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
  }

  // ref 50, max 560, rolloff 1.3; linear clamps the rolloff to 1 and the distance to max.
  expect(attenuation('linear', 400)).toBeCloseTo(1 - 350 / 510, 12);
  expect(attenuation('linear', 560)).toBe(0);
  expect(attenuation('linear', 10000)).toBe(0);
  expect(attenuation('inverse', 400)).toBeCloseTo(50 / (50 + 1.3 * 350), 12);
  expect(attenuation('exponential', 400)).toBeCloseTo(8 ** -1.3, 12);

  // inverse and exponential ignore maxDistance and keep falling beyond it.
  expect(attenuation('inverse', 10000)).toBeLessThan(attenuation('inverse', 560));
  expect(attenuation('exponential', 10000)).toBeLessThan(attenuation('exponential', 560));
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
