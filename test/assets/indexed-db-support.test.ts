import { openIndexedDb } from '#assets/storage/indexedDbSupport';

/** An open request whose `success`, `error` and `blocked` events the test fires by hand. */
const createOpenRequest = (close: () => void): IDBOpenDBRequest => {
  const request = new EventTarget() as EventTarget & { result: unknown; error: unknown; transaction: unknown };

  request.result = { close };
  request.error = null;
  request.transaction = null;

  return request as unknown as IDBOpenDBRequest;
};

describe('openIndexedDb', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('closes a connection that arrives after the open was already rejected as blocked', async () => {
    const close = vi.fn();
    const request = createOpenRequest(close);

    vi.stubGlobal('indexedDB', { open: () => request });

    const opening = openIndexedDb('blocked-db', 1, () => undefined);

    request.dispatchEvent(new Event('blocked'));

    await expect(opening).rejects.toThrow('Opening the database "blocked-db" is blocked by another connection holding an older version.');

    // The blocking connection went away and the open completed after all. Nothing
    // is waiting for it any more, and leaving it open blocks the next upgrade.
    request.dispatchEvent(new Event('success'));

    expect(close).toHaveBeenCalledTimes(1);
  });

  test('resolves with the connection when the open succeeds', async () => {
    const request = createOpenRequest(vi.fn());

    vi.stubGlobal('indexedDB', { open: () => request });

    const opening = openIndexedDb('open-db', 1, () => undefined);

    request.dispatchEvent(new Event('success'));

    await expect(opening).resolves.toBe(request.result);
  });
});
