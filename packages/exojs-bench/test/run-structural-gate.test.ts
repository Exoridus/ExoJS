import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runMatrix: vi.fn(),
}));

vi.mock('../src/rendering/driver', () => ({ runMatrix: mocks.runMatrix, SOFTWARE_LAUNCH_FLAGS: [] }));

describe('structural gate update', () => {
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
    ['no guarded measurements', [{ spec: { archetype: 'batch-breaking' }, status: 'ok' }]],
  ])('does not overwrite the baseline with %s', async (_description, results) => {
    directory = mkdtempSync(join(tmpdir(), 'exo-structural-gate-'));
    const baselinePath = join(directory, 'baseline.json');
    writeFileSync(baselinePath, 'original');
    process.argv = ['node', 'runStructuralGate', '--update', '--baseline', baselinePath];
    mocks.runMatrix.mockResolvedValue({ results, provenance: [] });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('../src/runStructuralGate');
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(process.exitCode).toBe(1);
    expect(readFileSync(baselinePath, 'utf8')).toBe('original');
  });
});
