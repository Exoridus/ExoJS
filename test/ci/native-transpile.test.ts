import { transpileNative } from '@codexo/exojs-config/typescript/transpile';
import { describe, expect, it } from 'vitest';

describe('native TypeScript 7.1 syntax-only transpile', () => {
  it('strips TypeScript annotations while retaining ESM exports and ES2022 output', () => {
    const output = transpileNative('export const answer: number = 42;');

    expect(output).toMatch(/export const answer = 42;/u);
    expect(output).not.toContain(': number');
  });

  it('retains source comments and supports the Node server ES2023 target', () => {
    const output = transpileNative('// keep me\nexport const value: string = "ready";', { target: 'es2023' });

    expect(output).toContain('// keep me');
    expect(output).toContain('export const value = "ready";');
  });
});
