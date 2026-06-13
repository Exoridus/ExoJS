import { describe, expect, it } from 'vitest';

import { interpretAttwJson } from '../../scripts/release/attw';

/** Minimal attw `--format json` payload: one entrypoint, configurable problems. */
const payload = (opts: { bundlerResolved?: boolean; problems?: Array<{ kind: string; resolutionKind?: string; resolutionOption?: string }> }): string =>
  JSON.stringify({
    analysis: {
      packageName: '@codexo/exojs-tilemap',
      entrypoints: {
        '.': {
          resolutions: {
            bundler: { resolution: opts.bundlerResolved === false ? null : { fileName: '/dist/esm/index.d.ts' } },
            node10: { resolution: { fileName: '/dist/esm/index.d.ts' } },
          },
        },
      },
      problems: opts.problems ?? [],
    },
  });

describe('interpretAttwJson', () => {
  it('passes when bundler resolves and only ignored (non-bundler) problems exist', () => {
    // Exactly the real v0.13 shape: node10/node16 problems, bundler clean.
    const stdout = payload({
      problems: [
        { kind: 'CJSResolvesToESM', resolutionKind: 'node16-cjs' },
        { kind: 'InternalResolutionError', resolutionOption: 'node16' },
        { kind: 'NoResolution', resolutionKind: 'node10' },
      ],
    });
    expect(interpretAttwJson(stdout)).toEqual({ ok: true });
  });

  it('passes with no problems at all', () => {
    expect(interpretAttwJson(payload({})).ok).toBe(true);
  });

  it('fails when a problem is scoped to the bundler resolution (even if it would be an ignored rule)', () => {
    const result = interpretAttwJson(payload({ problems: [{ kind: 'NoResolution', resolutionKind: 'bundler' }] }));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('bundler problem');
  });

  it('fails when a bundler problem is reported via resolutionOption', () => {
    expect(interpretAttwJson(payload({ problems: [{ kind: 'InternalResolutionError', resolutionOption: 'bundler' }] })).ok).toBe(false);
  });

  it('fails when an entrypoint has no bundler resolution', () => {
    const result = interpretAttwJson(payload({ bundlerResolved: false }));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('no bundler resolution');
  });

  it('fails on non-JSON output (the human/table rendering that broke the old parser)', () => {
    expect(interpretAttwJson('No problems found 🌟\nbundler: 🟢').ok).toBe(false);
  });

  it('tolerates a leading banner before the JSON object', () => {
    expect(interpretAttwJson(`some banner line\n${payload({})}`).ok).toBe(true);
  });

  it('fails when no entrypoints were analyzed', () => {
    expect(interpretAttwJson(JSON.stringify({ analysis: { entrypoints: {} } })).ok).toBe(false);
  });
});
