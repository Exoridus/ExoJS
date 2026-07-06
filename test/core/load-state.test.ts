import { LoadState } from '#core/LoadState';

describe('LoadState', () => {
  const owner = { tag: 'owner' };

  test("starts 'ready' with no error", () => {
    const state = new LoadState<object>();

    expect(state.value).toBe('ready');
    expect(state.error).toBeNull();
  });

  test('loaded() resolves immediately when ready', async () => {
    const state = new LoadState<object>();

    await expect(state.loaded(owner)).resolves.toBe(owner);
  });

  test('loaded() returns the same cached promise across accesses', () => {
    const state = new LoadState<object>();

    expect(state.loaded(owner)).toBe(state.loaded(owner));
  });

  test("begin() enters 'loading'; settle() resolves a promise materialized while loading", async () => {
    const state = new LoadState<object>();

    state.begin();
    expect(state.value).toBe('loading');

    const pending = state.loaded(owner);

    state.settle(owner);
    expect(state.value).toBe('ready');
    await expect(pending).resolves.toBe(owner);
  });

  test('settle() without a materialized promise resolves lazily afterwards', async () => {
    const state = new LoadState<object>();

    state.begin();
    state.settle(owner);

    await expect(state.loaded(owner)).resolves.toBe(owner);
  });

  test('fail() rejects a promise materialized while loading', async () => {
    const state = new LoadState<object>();

    state.begin();
    const pending = state.loaded(owner);

    state.fail(new Error('boom'));
    expect(state.value).toBe('failed');
    expect(state.error?.message).toBe('boom');
    await expect(pending).rejects.toThrow('boom');
  });

  test('loaded() after fail() rejects lazily with the original error', async () => {
    const state = new LoadState<object>();

    state.begin();
    state.fail(new Error('boom'));

    await expect(state.loaded(owner)).rejects.toThrow('boom');
  });

  test('multiple awaiters all settle (Promise.all)', async () => {
    const state = new LoadState<object>();

    state.begin();
    const all = Promise.all([state.loaded(owner), state.loaded(owner), state.loaded(owner)]);

    state.settle(owner);
    await expect(all).resolves.toEqual([owner, owner, owner]);
  });

  test('begin() after fail() re-materializes a FRESH promise; the old one stays rejected', async () => {
    const state = new LoadState<object>();

    state.begin();
    state.fail(new Error('boom'));
    const rejected = state.loaded(owner);

    await expect(rejected).rejects.toThrow('boom');

    state.begin();
    const fresh = state.loaded(owner);

    expect(fresh).not.toBe(rejected);
    expect(state.error).toBeNull();

    state.settle(owner);
    await expect(fresh).resolves.toBe(owner);
    await expect(rejected).rejects.toThrow('boom');
  });
});
