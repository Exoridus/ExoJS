import { describe, expect, it } from 'vitest';

import { parseProbeReport } from '../../scripts/ci/browser-probe.ts';
import { browserProfile } from '../../scripts/ci/browser-profiles.ts';
import { describeRow, judgePreflight, judgeRun, latestRows, type ProbeFailure, type ProbeReport, type QualificationRow } from '../../scripts/ci/capability.ts';
import { parseQualifyArguments } from '../../scripts/ci/qualify.ts';

/**
 * The three outcomes a browser row can have - PASS, UNSUPPORTED HOST, FAIL - and
 * the rule that keeps them apart: only an informational row may turn a missing
 * capability into an unsupported host, and a skip is never a pass.
 */

const report = (capabilities: Record<string, boolean>): ProbeReport => ({
  browser: 'TestBrowser/1',
  capabilities: Object.fromEntries(Object.entries(capabilities).map(([name, ok]) => [name, { ok, detail: ok ? 'present' : `${name} missing` }])),
  info: {},
});

describe('judgePreflight', () => {
  it('lets a row run when every required capability is present', () => {
    const verdict = judgePreflight(report({ 'webgpu-device': true, 'media-frame': true }), ['webgpu-device', 'media-frame'], 'required');

    expect(verdict).toMatchObject({ status: 'PASS', proceed: true, exitCode: 0 });
  });

  it('fails a required row that lost a capability, with the reason, and does not run it', () => {
    const verdict = judgePreflight(report({ 'webgpu-adapter': false, 'webgpu-device': false }), ['webgpu-device'], 'required');

    expect(verdict).toMatchObject({ status: 'FAIL', failure: 'capability', proceed: false, exitCode: 1 });
    expect(verdict.detail).toContain('webgpu-device: webgpu-device missing');
  });

  it('reports an informational row as an unsupported host without failing the job', () => {
    const verdict = judgePreflight(report({ 'webgpu-adapter': false }), ['webgpu-adapter'], 'informational');

    expect(verdict).toMatchObject({ status: 'UNSUPPORTED HOST', proceed: false, exitCode: 0 });
    expect(describeRow(verdict)).toBe('UNSUPPORTED HOST: webgpu-adapter: webgpu-adapter missing');
  });

  it('never counts an unsupported host as a pass', () => {
    const verdict = judgePreflight(report({ 'webgpu-adapter': false }), ['webgpu-adapter'], 'informational');

    expect(verdict.status).not.toBe('PASS');
    expect(describeRow(verdict)).not.toBe('PASS');
  });

  it('treats a capability the probe did not report as missing', () => {
    expect(judgePreflight(report({}), ['media-frame'], 'required')).toMatchObject({ status: 'FAIL', failure: 'capability' });
    expect(judgePreflight(report({}), ['media-frame'], 'informational')).toMatchObject({ status: 'UNSUPPORTED HOST' });
  });

  it('separates a probe that could not run from a host that lacks a capability', () => {
    const failure: ProbeFailure = { error: 'browser launch exceeded 90000 ms' };

    expect(judgePreflight(failure, ['webgpu-device'], 'required')).toMatchObject({ status: 'FAIL', failure: 'infrastructure', exitCode: 1 });
    expect(judgePreflight(failure, ['webgpu-device'], 'informational')).toMatchObject({ status: 'FAIL', failure: 'infrastructure', exitCode: 0 });
  });
});

describe('judgeRun', () => {
  it('passes only a clean exit', () => {
    expect(judgeRun({ status: 0 }, 'required')).toMatchObject({ status: 'PASS', exitCode: 0 });
    expect(judgeRun({ status: 1 }, 'required')).toMatchObject({ status: 'FAIL', failure: 'test', exitCode: 1 });
  });

  it('classifies an outer deadline as a timeout and keeps a required timeout red', () => {
    expect(judgeRun({ status: 124, timedOut: true }, 'required')).toMatchObject({ status: 'FAIL', failure: 'timeout', exitCode: 124 });
  });

  it('reports an informational failure or timeout without failing the job', () => {
    expect(judgeRun({ status: 124, timedOut: true }, 'informational')).toMatchObject({ status: 'FAIL', failure: 'timeout', exitCode: 0 });
    expect(judgeRun({ status: 1 }, 'informational')).toMatchObject({ status: 'FAIL', failure: 'test', exitCode: 0 });
  });

  it('does not call a run green when the cleanup of its processes failed', () => {
    expect(judgeRun({ status: 0, cleanupError: 'descendant survived' }, 'required')).toMatchObject({ status: 'FAIL', failure: 'infrastructure' });
  });
});

describe('recorded rows', () => {
  const row = (name: string, finishedAt: string, status: QualificationRow['status']): QualificationRow => ({
    row: name,
    policy: 'informational',
    status,
    detail: '',
    durationMs: 1,
    finishedAt,
  });

  it('keeps the newest record per row and orders by name', () => {
    const latest = latestRows([
      row('Firefox / WebGPU Core', '2026-01-01T00:00:00Z', 'FAIL'),
      row('Chromium / WebGPU Core', '2026-01-01T00:00:00Z', 'PASS'),
      row('Firefox / WebGPU Core', '2026-01-02T00:00:00Z', 'UNSUPPORTED HOST'),
    ]);

    expect(latest.map(entry => [entry.row, entry.status])).toEqual([
      ['Chromium / WebGPU Core', 'PASS'],
      ['Firefox / WebGPU Core', 'UNSUPPORTED HOST'],
    ]);
  });
});

describe('parseProbeReport', () => {
  it('accepts a well-formed report', () => {
    const parsed = parseProbeReport({ browser: 'X', capabilities: { webgl2: { ok: true, detail: 'WebGL 2.0' } }, info: { renderer: 'llvmpipe' } });

    expect(parsed).toEqual({ browser: 'X', capabilities: { webgl2: { ok: true, detail: 'WebGL 2.0' } }, info: { renderer: 'llvmpipe' } });
  });

  it.each([[null], ['text'], [{}], [{ browser: 'X', capabilities: { webgl2: { ok: 'yes', detail: '' } } }]])('rejects a malformed report: %j', raw => {
    expect(parseProbeReport(raw)).toHaveProperty('error');
  });
});

describe('parseQualifyArguments', () => {
  it('parses a row, its policy, preflight and command', () => {
    expect(
      parseQualifyArguments([
        '--row',
        'Firefox / WebGPU Core',
        '--preflight',
        'firefox-webgpu',
        '--requires',
        'webgpu-device',
        '--policy',
        'informational',
        '--timeout',
        '10',
        '--',
        'pnpm',
        'test',
      ]),
    ).toEqual({
      report: false,
      options: {
        row: 'Firefox / WebGPU Core',
        policy: 'informational',
        preflight: 'firefox-webgpu',
        requires: ['webgpu-device'],
        timeoutMinutes: 10,
        command: ['pnpm', 'test'],
      },
    });
  });

  it('defaults to a required row', () => {
    const parsed = parseQualifyArguments(['--row', 'r', '--', 'node']);

    expect(parsed).toMatchObject({ report: false, options: { policy: 'required' } });
  });

  it.each([
    [['--row', 'r']],
    [['--', 'node']],
    [['--row', 'r', '--policy', 'optional', '--', 'node']],
    [['--row', 'r', '--preflight', 'safari', '--', 'node']],
    [['--row', 'r', '--requires', 'webgl2', '--', 'node']],
    [['--row', 'r', '--timeout', '0', '--', 'node']],
    [['--row', 'r', '--retries', '3', '--', 'node']],
  ])('rejects %j instead of running a different row than was asked for', argv => {
    expect(() => parseQualifyArguments(argv)).toThrow();
  });
});

describe('browser profiles', () => {
  it('runs Firefox WebGPU headed, because a headless Firefox has no adapter', () => {
    expect(browserProfile('firefox-webgpu', {}).headless).toBe(false);
  });

  it('opts the Linux runner into headed Chromium WebGPU and Firefox WebGL2 through the environment', () => {
    expect(browserProfile('chromium-webgpu', {}).headless).toBe(true);
    expect(browserProfile('chromium-webgpu', { EXOJS_WEBGPU_CI_HEADED: '1' }).headless).toBe(false);
    expect(browserProfile('firefox-webgl2', {}).headless).toBe(true);
    expect(browserProfile('firefox-webgl2', { EXOJS_FIREFOX_CI_HEADED: '1' }).headless).toBe(false);
  });
});
