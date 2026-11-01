import { describe, expect, test } from 'vitest';

import { releaseFailedPreview } from '../src/rendering/dpr-probe/previewCleanup';

describe('releaseFailedPreview', () => {
  test('undoes instrumentation, disposes the scene and destroys the app', async () => {
    const calls: string[] = [];

    await releaseFailedPreview({
      restores: [() => calls.push('undo')],
      disposeScene: () => calls.push('scene'),
      destroyApp: () => {
        calls.push('app');
      },
    });

    expect(calls).toEqual(['undo', 'scene', 'app']);
  });

  test('keeps releasing when an earlier step throws, and never obscures the caller error', async () => {
    const calls: string[] = [];

    await expect(
      releaseFailedPreview({
        restores: [
          () => calls.push('undo-1'),
          () => {
            calls.push('undo-2');

            throw new Error('undo failed');
          },
        ],
        disposeScene: () => {
          calls.push('scene');

          throw new Error('dispose failed');
        },
        destroyApp: () => {
          calls.push('app');
        },
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual(['undo-1', 'undo-2', 'scene', 'app']);
  });

  test('skips the scene when construction never returned', async () => {
    const calls: string[] = [];

    await releaseFailedPreview({
      restores: [],
      disposeScene: null,
      destroyApp: () => {
        calls.push('app');
      },
    });

    expect(calls).toEqual(['app']);
  });
});
