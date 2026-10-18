import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  run: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../scripts/release/command-runner.ts', () => ({
  createExecRunner: state.create,
}));
vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));

const load = async (mode: string): Promise<void> => {
  vi.stubEnv('EXOJS_OUTPUT', mode);
  state.create.mockReturnValue({ run: state.run });
  await import('../../scripts/verify-publish.ts');
};

const setup = () => {
  vi.resetModules();
  state.run.mockReset().mockReturnValue({ code: 0, stdout: 'tarball contents\n', stderr: 'tool detail\n' });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  return { log, error, stdout, stderr };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('publish verification output', () => {
  it.each(['normal', 'compact'])('summarizes successful packages in %s mode and still runs every check', async mode => {
    const { log, stdout, stderr } = setup();
    await load(mode);
    expect(state.run).toHaveBeenCalledTimes(32);
    expect(state.run.mock.calls[0]?.[0]).toMatchObject({ command: 'pnpm', args: ['pack', '--dry-run'] });
    expect(state.run.mock.calls[1]?.[0]).toMatchObject({ command: 'pnpm', args: ['dlx', 'publint@0.3.21', '--strict', '.'] });
    expect(log.mock.calls.flat().join('\n')).toContain('@codexo/exojs: pack OK, publint OK');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('keeps silent successes silent', async () => {
    const { log, stdout, stderr } = setup();
    await load('silent');
    expect(state.run).toHaveBeenCalledTimes(32);
    expect(log).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('shows complete command output in verbose mode', async () => {
    const { log, stdout, stderr } = setup();
    await load('verbose');
    expect(log.mock.calls.flat().join('\n')).toContain('pnpm pack --dry-run');
    expect(stdout).toHaveBeenCalledWith('tarball contents\n');
    expect(stderr).toHaveBeenCalledWith('tool detail\n');
  });

  it.each([0, 1])('retains full diagnostics when check %s fails and continues other packages', async failingCheck => {
    const { stdout, stderr, error } = setup();
    state.run.mockImplementationOnce(() =>
      failingCheck === 0 ? { code: 1, stdout: 'full pack diagnostic\n', stderr: 'pack error\n' } : { code: 0, stdout: '', stderr: '' },
    );

    if (failingCheck === 1) {
      state.run.mockImplementationOnce(() => ({ code: 1, stdout: 'full publint diagnostic\n', stderr: 'publint error\n' }));
    }

    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit 1');
    });
    await expect(load('silent')).rejects.toThrow('exit 1');
    expect(state.run).toHaveBeenCalledTimes(failingCheck === 0 ? 31 : 32);
    expect(stdout).toHaveBeenCalledWith(failingCheck === 0 ? 'full pack diagnostic\n' : 'full publint diagnostic\n');
    expect(stderr).toHaveBeenCalledWith(failingCheck === 0 ? 'pack error\n' : 'publint error\n');
    expect(error.mock.calls.flat().join('\n')).toContain('1 of 16 published package(s) failed.');
  });
});
