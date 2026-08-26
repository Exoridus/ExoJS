import { describe, expect, it } from 'vitest';

import { findFootgunCandidates, footgunMessage, returnsPromise } from '../../site/src/lib/footgun-diagnostics.ts';

const calleesIn = (source: string): string[] => findFootgunCandidates(source).map(candidate => candidate.callee);

describe('findFootgunCandidates', () => {
  it('proposes a plain call statement', () => {
    expect(calleesIn('app.start(GameScene);\n')).toEqual(['app.start']);
  });

  it('follows an identifier chain through this', () => {
    expect(calleesIn('  this.app.scenes.change(GameScene);\n')).toEqual(['this.app.scenes.change']);
  });

  it('skips statements that already say what happens to the value', () => {
    const source = ['await app.start(A);', 'void app.destroy();', 'return loader.load(B);', 'const p = fetch(url);'].join('\n');

    expect(calleesIn(source)).toEqual([]);
  });

  it('skips a statement that already handles the rejection', () => {
    expect(calleesIn('app.start(A).catch(reportFailure);\n')).toEqual([]);
    expect(calleesIn('app.start(A).then(onReady);\n')).toEqual([]);
  });

  it('skips a nested call that is an argument, and keeps the statement around it', () => {
    const source = ['register(', '  loader.load(asset),', ');'].join('\n');

    expect(calleesIn(source)).toEqual(['register']);
  });

  it('proposes a statement whose argument list opens on the same line', () => {
    const source = ['pad.vibrate({', '  duration: 200,', '});'].join('\n');

    expect(calleesIn(source)).toEqual(['pad.vibrate']);
  });

  it('skips comments', () => {
    expect(calleesIn('// app.start(GameScene);\n')).toEqual([]);
    expect(calleesIn(' * app.start(GameScene);\n')).toEqual([]);
  });

  it('points at the final identifier of the chain, not the receiver', () => {
    const source = 'this.app.scenes.change(GameScene);';
    const [candidate] = findFootgunCandidates(source);

    expect(source.slice(candidate.calleeOffset, candidate.calleeOffset + 'change'.length)).toBe('change');
  });

  it('reports positions relative to the whole document', () => {
    const source = ['const app = new Application();', '', 'app.start(GameScene);'].join('\n');
    const [candidate] = findFootgunCandidates(source);

    expect(candidate.lineNumber).toBe(3);
    expect(candidate.column).toBe(1);
    expect(source.slice(candidate.calleeOffset, candidate.calleeOffset + 'start'.length)).toBe('start');
  });
});

describe('returnsPromise', () => {
  const parts = (spec: ReadonlyArray<[string, string]>): { displayParts: Array<{ text: string; kind: string }> } => ({
    displayParts: spec.map(([text, kind]) => ({ text, kind })),
  });

  it('accepts a signature returning a promise', () => {
    // (method) Application.start(target: K): Promise<this>
    const info = parts([
      ['start', 'methodName'],
      ['(', 'punctuation'],
      ['target', 'parameterName'],
      [':', 'punctuation'],
      ['K', 'typeParameterName'],
      [')', 'punctuation'],
      [':', 'punctuation'],
      ['Promise', 'className'],
      ['<', 'punctuation'],
      ['this', 'keyword'],
      ['>', 'punctuation'],
    ]);

    expect(returnsPromise(info)).toBe(true);
  });

  it('rejects a signature that only takes a promise', () => {
    // (method) Runner.observe(promise: Promise<void>): void
    const info = parts([
      ['observe', 'methodName'],
      ['(', 'punctuation'],
      ['promise', 'parameterName'],
      [':', 'punctuation'],
      ['Promise', 'className'],
      ['<', 'punctuation'],
      ['void', 'keyword'],
      ['>', 'punctuation'],
      [')', 'punctuation'],
      [':', 'punctuation'],
      ['void', 'keyword'],
    ]);

    expect(returnsPromise(info)).toBe(false);
  });

  it('rejects a synchronous signature', () => {
    const info = parts([
      ['render', 'methodName'],
      ['(', 'punctuation'],
      [')', 'punctuation'],
      [':', 'punctuation'],
      ['void', 'keyword'],
    ]);

    expect(returnsPromise(info)).toBe(false);
  });

  it('is false for a missing or empty response', () => {
    expect(returnsPromise(undefined)).toBe(false);
    expect(returnsPromise(null)).toBe(false);
    expect(returnsPromise({ displayParts: [] })).toBe(false);
  });
});

describe('footgunMessage', () => {
  it('names the call and the three ways out', () => {
    const message = footgunMessage('app.start');

    expect(message).toContain('app.start(...)');
    expect(message).toContain('await');
    expect(message).toContain('.catch(...)');
    expect(message).toContain('void');
  });
});
