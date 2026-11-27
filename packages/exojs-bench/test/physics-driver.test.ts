import { beforeEach, describe, expect, test, vi } from 'vitest';

const resources = vi.hoisted(() => ({
  serverClose: vi.fn(),
  launch: vi.fn(),
  start: vi.fn(),
  timeout: vi.fn(),
}));

vi.mock('playwright', () => ({ chromium: { launch: resources.launch }, webkit: { launch: resources.launch } }));
vi.mock('../src/shared/viteServer', () => ({ PHYSICS_LIBRARY_ARMS: [], startViteServer: resources.start }));
vi.mock('../src/shared/timeout', () => ({ raceWithTimeout: resources.timeout }));

import { runPhysicsMatrix } from '../src/physics/driver';

beforeEach(() => {
  vi.resetAllMocks();
  resources.serverClose.mockResolvedValue(undefined);
  resources.start.mockResolvedValue({ resolvedUrls: { local: ['http://localhost'], network: [] }, close: resources.serverClose });
});

describe('physics matrix resource cleanup', () => {
  test('closes the server when browser launch fails', async () => {
    resources.launch.mockRejectedValue(new Error('launch failed'));

    await expect(runPhysicsMatrix()).rejects.toThrow('launch failed');
    expect(resources.serverClose).toHaveBeenCalledOnce();
  });

  test.each(['newPage', 'goto', 'waitForFunction', 'clock', 'arms', 'version'])('closes browser and server when %s fails', async stage => {
    const failure = new Error(`${stage} failed`);
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValueOnce({ resolutionMs: 1, crossOriginIsolated: true }).mockResolvedValueOnce([]),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
      version: vi.fn().mockReturnValue('1'),
    };
    resources.launch.mockResolvedValue(browser);

    if (stage === 'newPage') {
      browser.newPage.mockRejectedValue(failure);
    }

    if (stage === 'goto') {
      page.goto.mockRejectedValue(failure);
    }

    if (stage === 'waitForFunction') {
      page.waitForFunction.mockRejectedValue(failure);
    }

    if (stage === 'clock') {
      page.evaluate.mockReset().mockRejectedValue(failure);
    }

    if (stage === 'arms') {
      page.evaluate.mockReset().mockResolvedValueOnce({ resolutionMs: 1, crossOriginIsolated: true }).mockRejectedValueOnce(failure);
    }

    if (stage === 'version') {
      browser.version.mockImplementation(() => {
        throw failure;
      });
    }

    await expect(runPhysicsMatrix()).rejects.toThrow(failure);
    expect(browser.close).toHaveBeenCalledOnce();
    expect(resources.serverClose).toHaveBeenCalledOnce();
  });

  test('closes both browsers and the server when relaunch setup fails', async () => {
    const page = {
      goto: vi.fn(),
      waitForFunction: vi.fn(),
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({ resolutionMs: 1, crossOriginIsolated: true })
        .mockResolvedValueOnce([
          { engine: 'exojs-physics', config: 'native', library: '@codexo/exojs/physics', available: true, reason: '' },
        ])
        .mockImplementationOnce(() => new Promise(() => undefined)),
    };
    const first = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
      version: vi.fn().mockReturnValue('1'),
    };
    const second = { newPage: vi.fn().mockRejectedValue(new Error('relaunch failed')), close: vi.fn().mockResolvedValue(undefined) };
    resources.launch.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    resources.timeout.mockImplementation(async (_promise, _duration, sentinel) => sentinel);

    await expect(runPhysicsMatrix()).rejects.toThrow('relaunch failed');
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(resources.serverClose).toHaveBeenCalledOnce();
  });

  test('closes the server even if browser close fails', async () => {
    const browser = {
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn(),
        waitForFunction: vi.fn(),
        evaluate: vi.fn().mockResolvedValueOnce({ resolutionMs: 1 }).mockResolvedValueOnce([]),
      }),
      close: vi.fn().mockRejectedValue(new Error('close failed')),
      version: vi.fn().mockReturnValue('1'),
    };
    resources.launch.mockResolvedValue(browser);

    await expect(runPhysicsMatrix()).rejects.toThrow();
    expect(resources.serverClose).toHaveBeenCalledOnce();
  });
});
