import { LoadingQueue } from '#resources/LoadingQueue';

describe('LoadingQueue', () => {
  test('is awaitable via "then" and resolves with the wrapped promise value', async () => {
    const queue = new LoadingQueue(Promise.resolve('done'), 1);

    await expect(queue).resolves.toBe('done');
  });

  test('progress starts at total=count, loaded=0, pending=count, failed=0', () => {
    const queue = new LoadingQueue(Promise.resolve('x'), 3);

    expect(queue.progress).toEqual({ total: 3, loaded: 0, pending: 3, failed: 0 });
  });

  test('_notifyItem updates loaded/pending/failed and dispatches onProgress', () => {
    const queue = new LoadingQueue(Promise.resolve('x'), 2);
    const updates: unknown[] = [];

    queue.onProgress.add(progress => updates.push(progress));

    queue._notifyItem(true);
    queue._notifyItem(false);

    expect(updates).toEqual([
      { total: 2, loaded: 1, pending: 1, failed: 0 },
      { total: 2, loaded: 1, pending: 0, failed: 1 },
    ]);
    expect(queue.progress).toEqual({ total: 2, loaded: 1, pending: 0, failed: 1 });
  });

  test('catch() delegates rejection handling to the wrapped promise', async () => {
    const queue = new LoadingQueue(Promise.reject(new Error('boom')), 1);

    await expect(queue.catch(err => (err as Error).message)).resolves.toBe('boom');
  });

  test('finally() delegates to the wrapped promise and runs the callback once it settles', async () => {
    let ran = false;
    const queue = new LoadingQueue(Promise.resolve('ok'), 1);

    const result = await queue.finally(() => {
      ran = true;
    });

    expect(ran).toBe(true);
    expect(result).toBe('ok');
  });

  test('finally() callback still runs when the wrapped promise rejects', async () => {
    let ran = false;
    const queue = new LoadingQueue(Promise.reject(new Error('nope')), 1);

    await expect(
      queue.finally(() => {
        ran = true;
      }),
    ).rejects.toThrow('nope');
    expect(ran).toBe(true);
  });
});
