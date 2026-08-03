/**
 * Minimal in-memory fake of the browser IndexedDB API, purpose-built to drive
 * `IndexedDbDatabase` / `IndexedDbStore` through their real event-driven code
 * paths in unit tests (jsdom does not implement IndexedDB).
 *
 * This is intentionally NOT a spec-complete polyfill — it only implements the
 * subset of `IDBFactory` / `IDBDatabase` / `IDBTransaction` / `IDBObjectStore`
 * behaviour those two modules touch, including the `abort`/`error` event
 * bubbling from a versionchange transaction up to its `IDBDatabase` (which is
 * exactly what `IndexedDbDatabase.connect()` relies on to catch a migration
 * that returns `false`).
 *
 * Every database persists for the lifetime of the fake `IDBFactory` instance
 * returned by {@link createFakeIndexedDb}, so reconnecting with a higher
 * version number correctly observes the previous store schema.
 */

interface StoreRecord {
  keyPath: string;
  data: Map<string, unknown>;
}

interface DatabaseRecord {
  version: number;
  stores: Map<string, StoreRecord>;
}

/** Single-shot fault queue shared by every object store carved out of one fake factory. */
class RequestFaultQueue {
  private _nextError: Error | null = null;

  public queue(error: Error): void {
    this._nextError = error;
  }

  public consume(): Error | null {
    const error = this._nextError;

    this._nextError = null;

    return error;
  }
}

class FakeIdbRequest extends EventTarget {
  public result: unknown = undefined;
  public error: Error | null = null;
  public readyState: 'pending' | 'done' = 'pending';
  public transaction: FakeIdbTransaction | null = null;

  public _succeed(result: unknown): void {
    this.result = result;
    this.readyState = 'done';
    this.dispatchEvent(new Event('success'));
  }

  public _fail(error: Error): void {
    this.error = error;
    this.readyState = 'done';
    this.dispatchEvent(new Event('error'));
  }
}

class FakeIdbOpenDbRequest extends FakeIdbRequest {}

class FakeIdbObjectStore {
  public constructor(
    private readonly _store: StoreRecord,
    private readonly _faults: RequestFaultQueue,
  ) {}

  public get(key: string): FakeIdbRequest {
    const request = new FakeIdbRequest();

    queueMicrotask(() => {
      const error = this._faults.consume();

      if (error) {
        request._fail(error);

        return;
      }

      request._succeed(this._store.data.get(key));
    });

    return request;
  }

  public put(value: Record<string, unknown>): FakeIdbRequest {
    const request = new FakeIdbRequest();
    const key = value[this._store.keyPath] as string;

    queueMicrotask(() => {
      const error = this._faults.consume();

      if (error) {
        request._fail(error);

        return;
      }

      this._store.data.set(key, value);
      request._succeed(undefined);
    });

    return request;
  }

  public delete(key: string): FakeIdbRequest {
    const request = new FakeIdbRequest();

    queueMicrotask(() => {
      const error = this._faults.consume();

      if (error) {
        request._fail(error);

        return;
      }

      this._store.data.delete(key);
      request._succeed(undefined);
    });

    return request;
  }

  public clear(): FakeIdbRequest {
    const request = new FakeIdbRequest();

    queueMicrotask(() => {
      const error = this._faults.consume();

      if (error) {
        request._fail(error);

        return;
      }

      this._store.data.clear();
      request._succeed(undefined);
    });

    return request;
  }
}

class FakeIdbTransaction extends EventTarget {
  public aborted = false;

  public constructor(
    private readonly _db: FakeIdbDatabase,
    public readonly objectStoreNames: readonly string[],
    private readonly _faults: RequestFaultQueue,
  ) {
    super();
  }

  public objectStore(name: string): FakeIdbObjectStore {
    return new FakeIdbObjectStore(this._db._getStoreRecord(name), this._faults);
  }

  public abort(): void {
    this.aborted = true;
    // Real IndexedDB bubbles an aborted versionchange transaction's `abort`
    // event to its connection (`IDBDatabase`) — `IndexedDbDatabase.connect()`
    // listens for exactly that to reject the open() promise.
    this.dispatchEvent(new Event('abort'));
    this._db.dispatchEvent(new Event('abort'));
  }
}

class FakeIdbDatabase extends EventTarget {
  public version: number;
  private _closed = false;

  public constructor(
    public readonly name: string,
    version: number,
    private readonly _record: DatabaseRecord,
    private readonly _faults: RequestFaultQueue,
  ) {
    super();
    this.version = version;
  }

  public get closed(): boolean {
    return this._closed;
  }

  public createObjectStore(name: string, options: { keyPath: string }): void {
    this._record.stores.set(name, { keyPath: options.keyPath, data: new Map() });
  }

  public deleteObjectStore(name: string): void {
    this._record.stores.delete(name);
  }

  public transaction(storeNames: readonly string[]): FakeIdbTransaction {
    return new FakeIdbTransaction(this, storeNames, this._faults);
  }

  public close(): void {
    this._closed = true;
  }

  public _getStoreRecord(name: string): StoreRecord {
    const store = this._record.stores.get(name);

    if (!store) {
      throw new Error(`FakeIndexedDb: object store "${name}" does not exist.`);
    }

    return store;
  }
}

class FakeIdbFactory {
  public readonly databases = new Map<string, DatabaseRecord>();
  public readonly faults = new RequestFaultQueue();
  private _nextOpenError: Error | null = null;
  private _nextOpenBlocked = false;
  private _nextUpgradeError: Error | null = null;
  private _nextDeleteDbError: Error | null = null;

  public queueOpenError(error: Error): void {
    this._nextOpenError = error;
  }

  public queueOpenBlocked(): void {
    this._nextOpenBlocked = true;
  }

  public queueUpgradeError(error: Error): void {
    this._nextUpgradeError = error;
  }

  public queueDeleteDatabaseError(error: Error): void {
    this._nextDeleteDbError = error;
  }

  public open(name: string, version = 1): FakeIdbOpenDbRequest {
    const request = new FakeIdbOpenDbRequest();

    queueMicrotask(() => {
      if (this._nextOpenBlocked) {
        this._nextOpenBlocked = false;
        request.dispatchEvent(new Event('blocked'));

        return;
      }

      if (this._nextOpenError) {
        const error = this._nextOpenError;

        this._nextOpenError = null;
        request._fail(error);

        return;
      }

      let record = this.databases.get(name);
      const oldVersion = record?.version ?? 0;

      if (!record) {
        record = { version: 0, stores: new Map() };
        this.databases.set(name, record);
      }

      const db = new FakeIdbDatabase(name, version, record, this.faults);

      if (version > oldVersion) {
        const storeNamesBeforeUpgrade = [...record.stores.keys()];
        const transaction = new FakeIdbTransaction(db, storeNamesBeforeUpgrade, this.faults);

        request.result = db;
        request.transaction = transaction;

        const upgradeEvent = Object.assign(new Event('upgradeneeded'), { oldVersion, newVersion: version });

        request.dispatchEvent(upgradeEvent);
        record.version = version;

        if (this._nextUpgradeError) {
          const error = this._nextUpgradeError;

          this._nextUpgradeError = null;
          db.dispatchEvent(new Event('error'));
          request._fail(error);

          return;
        }

        if (transaction.aborted) {
          // `transaction.abort()` already bubbled `abort` to `db` synchronously
          // above (inside the `upgradeneeded` listener) — the production code's
          // `database.addEventListener('abort', ...)` already rejected the
          // caller's promise. Firing `success` here would be a spec violation
          // (and a wasted, ignored settle on an already-rejected promise).
          return;
        }
      } else {
        request.result = db;
      }

      request._succeed(db);
    });

    return request;
  }

  public deleteDatabase(name: string): FakeIdbOpenDbRequest {
    const request = new FakeIdbOpenDbRequest();

    queueMicrotask(() => {
      if (this._nextDeleteDbError) {
        const error = this._nextDeleteDbError;

        this._nextDeleteDbError = null;
        request._fail(error);

        return;
      }

      this.databases.delete(name);
      request._succeed(undefined);
    });

    return request;
  }
}

/** Test-only control surface for a fake `IDBFactory` instance. */
export interface FakeIndexedDb {
  /** Cast to `IDBFactory` and assign to `globalThis.indexedDB` before importing the module under test. */
  readonly factory: IDBFactory;
  /** The next `open()` call fires a `blocked` event instead of connecting. */
  blockNextOpen(): void;
  /** The next `open()` call fails with `error` (not upgrade-related). */
  failNextOpen(error?: Error): void;
  /** The next `open()`'s upgrade transaction fails, bubbling `error` to the database. */
  failNextUpgrade(error?: Error): void;
  /** The next object-store request (`get`/`put`/`delete`/`clear`) fails. */
  failNextRequest(error?: Error): void;
  /** The next `deleteDatabase()` call fails. */
  failNextDeleteDatabase(error?: Error): void;
  /** True once `name` has been opened at least once (survives disconnects). */
  hasDatabase(name: string): boolean;
  /** Current object-store names persisted for `name`, or `undefined` if never opened. */
  storeNamesOf(name: string): readonly string[] | undefined;
}

/** Creates a fresh, isolated fake `IDBFactory` — one per test to avoid cross-test bleed. */
export const createFakeIndexedDb = (): FakeIndexedDb => {
  const factory = new FakeIdbFactory();

  return {
    factory: factory as unknown as IDBFactory,
    blockNextOpen: () => {
      factory.queueOpenBlocked();
    },
    failNextOpen: (error = new Error('fake open error')) => {
      factory.queueOpenError(error);
    },
    failNextUpgrade: (error = new Error('fake upgrade error')) => {
      factory.queueUpgradeError(error);
    },
    failNextRequest: (error = new Error('fake request error')) => {
      factory.faults.queue(error);
    },
    failNextDeleteDatabase: (error = new Error('fake delete database error')) => {
      factory.queueDeleteDatabaseError(error);
    },
    hasDatabase: (name: string) => factory.databases.has(name),
    storeNamesOf: (name: string) => {
      const record = factory.databases.get(name);

      return record ? [...record.stores.keys()] : undefined;
    },
  };
};
