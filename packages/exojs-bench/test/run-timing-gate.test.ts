import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runMatrix: vi.fn() }));

vi.mock('../src/rendering/driver', () => ({ runMatrix: mocks.runMatrix }));

describe('timing gate', () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  let directory: string;

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  test.each([
    ['no results', []],
    ['only unsuccessful results', [{ status: 'exceeded' }]],
  ])('does not overwrite the baseline with %s', async (_description, results) => {
    directory = mkdtempSync(join(tmpdir(), 'exo-timing-gate-'));
    const baselinePath = join(directory, 'baseline.json');
    writeFileSync(baselinePath, 'original');
    process.argv = ['node', 'runTimingGate', '--update', '--baseline', baselinePath];
    mocks.runMatrix.mockResolvedValue({ results, provenance: [] });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('../src/runTimingGate');
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(process.exitCode).toBe(1);
    expect(readFileSync(baselinePath, 'utf8')).toBe('original');
  });

  test('rejects an empty baseline when comparing', async () => {
    directory = mkdtempSync(join(tmpdir(), 'exo-timing-gate-'));
    const baselinePath = join(directory, 'baseline.json');
    writeFileSync(baselinePath, JSON.stringify({ recorded: { adapters: {}, cpu: 'test', confirmedIdle: true }, cells: [] }));
    process.argv = ['node', 'runTimingGate', '--baseline', baselinePath];
    mocks.runMatrix.mockResolvedValue({ results: [], provenance: [] });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('../src/runTimingGate');
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(process.exitCode).toBe(1);
  });
});
