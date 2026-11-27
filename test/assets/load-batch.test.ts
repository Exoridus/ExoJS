import { describe, expect, test, vi } from 'vitest';

import { LoadBatch, type LoadBatchSignals } from '#assets/LoadBatch';
import { logger } from '#core/Logger';
import { Signal } from '#core/Signal';

const createBatch = () => {
  const signals: LoadBatchSignals = {
    onLoadStart: new Signal(),
    onLoadProgress: new Signal(),
    onLoadComplete: new Signal(),
    onLoadError: new Signal(),
  };

  return { batch: new LoadBatch(signals), signals };
};

describe('LoadBatch observer accounting', () => {
  test.each(['onLoadStart', 'onLoadProgress', 'onLoadComplete', 'onLoadError'] as const)(
    '%s failures do not reject work or stop completion',
    name => {
      const { batch, signals } = createBatch();
      const report = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const observed = vi.fn();
      const completed = vi.fn();
      signals[name].add(() => {
        throw new Error('observer failed');
      });
      signals[name].add(observed);
      signals.onLoadComplete.add(completed);

      try {
        expect(() => batch.start('a', 'a.txt')).not.toThrow();
        expect(() => batch.settle('a', false, new Error('transport failed'))).not.toThrow();
        expect(observed).toHaveBeenCalledTimes(1);
        expect(completed).toHaveBeenCalledTimes(1);
        expect(report).toHaveBeenCalledTimes(1);
        batch.start('b', 'b.txt');
        batch.settle('b', true);
        expect(completed).toHaveBeenCalledTimes(2);
      } finally {
        report.mockRestore();
      }
    },
  );

  test('unmatched and repeated settlements do not consume another outstanding item', () => {
    const { batch, signals } = createBatch();
    const progress = vi.fn();
    const complete = vi.fn();
    signals.onLoadProgress.add(progress);
    signals.onLoadComplete.add(complete);
    batch.start('a', 'a.txt');
    batch.start('b', 'b.txt');
    batch.settle('a', true);
    batch.settle('a', true);
    batch.settle('unknown', true);
    expect(progress).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    batch.settle('b', true);
    expect(progress).toHaveBeenLastCalledWith(2, 2, 'b');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('overlapping starts with the same key remain separately accounted', () => {
    const { batch, signals } = createBatch();
    const progress = vi.fn();
    const complete = vi.fn();
    signals.onLoadProgress.add(progress);
    signals.onLoadComplete.add(complete);
    batch.start('same', 'a.txt');
    batch.start('same', 'a.txt');
    batch.settle('same', true);
    expect(complete).not.toHaveBeenCalled();
    batch.settle('same', true);
    expect(progress).toHaveBeenLastCalledWith(2, 2, 'same');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('a progress listener starting a new batch does not suppress the completed batch', () => {
    const { batch, signals } = createBatch();
    const progress = vi.fn();
    const complete = vi.fn();
    signals.onLoadProgress.add(progress);
    signals.onLoadProgress.add((_loaded, _total, key) => {
      if (key === 'a') {
        batch.start('b', 'b.txt');
      }
    });
    signals.onLoadComplete.add(complete);
    batch.start('a', 'a.txt');
    batch.settle('a', true);
    expect(complete).toHaveBeenCalledTimes(1);
    batch.settle('b', true);
    expect(progress.mock.calls).toEqual([
      [1, 1, 'a'],
      [1, 1, 'b'],
    ]);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  test('a nested settlement completes its existing batch only once', () => {
    const { batch, signals } = createBatch();
    const complete = vi.fn();
    signals.onLoadProgress.add((_loaded, _total, key) => {
      if (key === 'a') {
        batch.settle('b', true);
      }
    });
    signals.onLoadComplete.add(complete);
    batch.start('a', 'a.txt');
    batch.start('b', 'b.txt');
    batch.settle('a', true);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
