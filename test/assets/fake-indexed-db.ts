/**
 * Minimal in-memory fake of the browser IndexedDB API, purpose-built to drive
 * `IndexedDbDatabase` / `IndexedDbStore` through their real event-driven code
 * paths in unit tests (jsdom does not implement IndexedDB).
 *
 * This is intentionally NOT a spec-complete polyfill - it only implements the
 * subset of `IDBFactory` / `IDBDatabase` / `IDBTransaction` / `IDBObjectStore`
 * behaviour those two modules touch, including the `abort`/`error` event
 * bubbling from a versionchange transaction up to its `IDBDatabase` (which is
 * exactly what a failed migration relies on), and the `complete` event a
 * committed transaction fires - which is what both modules await before they
 * report a write as durable.
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

/** A half-open string key range, the only `IDBKeyRange` shape the cache store uses. */
export class FakeIdbKeyRange {
  private constructor(
    public readonly lower: string,
    public readonly upper: string,
  ) {}

  public static bound(lower: string, upper: string): FakeIdbKeyRange {
    return new FakeIdbKeyRange(lower, upper);
  }

  public includes(key: string): boolean {
    return key >= this.lower && key <= this.upper;
  }
}

class FakeIdbObjectStore {
  public constructor(
    private readonly _store: StoreRecord,
    private readonly _faults: RequestFaultQueue,
    public readonly transaction: FakeIdbTransaction,
  ) {}

  public get(key: string): FakeIdbRequest {
    return this._request(() => this._store.data.get(key));
  }

  public put(value: Record<string, unknown>): FakeIdbRequest {
    const key = value[this._store.keyPath] as string;

    return this._request(() => {
      this._store.data.set(key, value);
    });
  }

  public delete(key: string | FakeIdbKeyRange): FakeIdbRequest {
    return this._request(() => {
      if (typeof key === 'string') {
        this._store.data.delete(key);

        return;
      }

      for (const candidate of [...this._store.data.keys()]) {
        if (key.includes(candidate)) {
          this._store.data.delete(candidate);
        }
      }
    });
  }

  public clear(): FakeIdbRequest {
    return this._request(() => {
      this._store.data.clear();
    });
  }

  /**
   * Run one store operation asynchronously, settling its request and telling
   * the owning transaction whether it may still commit.
   */
  private _request(operation: () => unknown): FakeIdbRequest {
    const request = new FakeIdbRequest();

    this.transaction._requestStarted();

    queueMicrotask(() => {
      const error = this._faults.consume();

      if (error) {
        request._fail(error);
        this.transaction._requestSettled(error);

        return;
      }

      request._succeed(operation());
      this.transaction._requestSettled(null);
    });

    return request;
  }
}

class FakeIdbTransaction extends EventTarget {
  public aborted = false;
  public error: Error | null = null;

  private _pending = 0;
  private _settled = false;

  public constructor(
    private readonly _db: FakeIdbDatabase,
    public readonly objectStoreNames: readonly string[],
    private readonly _faults: RequestFaultQueue,
  ) {
    super();
  }

  public objectStore(name: string): FakeIdbObjectStore {
    return new FakeIdbObjectStore(this._db._getStoreRecord(name), this._faults, this);
  }

  public abort(): void {
    if (this._settled) {
      return;
    }

    this._settled = true;
    this.aborted = true;
    // Real IndexedDB bubbles an aborted versionchange transaction's `abort`
    // event to its connection (`IDBDatabase`) - a failed migration relies on
    // exactly that to reject the open() promise.
    this.dispatchEvent(new Event('abort'));
    this._db.dispatchEvent(new Event('abort'));
  }

  /** @internal */
  public _requestStarted(): void {
    this._pending++;
  }

  /**
   * Settle one request. A transaction commits only once every request it
   * carried has succeeded, and aborts as soon as one fails - which is what
   * makes awaiting `complete` a stronger promise than awaiting `success`.
   * @internal
   */
  public _requestSettled(error: Error | null): void {
    this._pending--;

    if (this._settled) {
      return;
    }

    if (error !== null) {
      this._settled = true;
      this.error = error;
      this.dispatchEvent(new Event('error'));
      this.dispatchEvent(new Event('abort'));

      return;
    }

    if (this._pending === 0) {
      // Commit on the next turn, so a caller that issues several requests
      // against one transaction is not committed after the first.
      queueMicrotask(() => {
        if (this._settled || this._pending > 0) {
          return;
        }

        this._settled = true;
        this.dispatchEvent(new Event('complete'));
      });
    }
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

  /** The `DOMStringList` shape production code reads: iterable, with `contains`. */
  public get objectStoreNames(): readonly string[] & { contains(name: string): boolean } {
    const names = [...this._record.stores.keys()];

    return Object.assign(names, { contains: (name: string) => names.includes(name) });
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
          // Real IndexedDB surfaces an upgrade failure on the versionchange
          // transaction; the `error` event then bubbles to the connection.
          transaction.error = error;
          db.dispatchEvent(new Event('error'));
          request._fail(error);

          return;
        }

        if (transaction.aborted) {
          // `transaction.abort()` already bubbled `abort` to `db` synchronously
          // above (inside the `upgradeneeded` listener) - the production code's
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
  /** Schema version persisted for `name`, or `undefined` if never opened. */
  versionOf(name: string): number | undefined;
  /** Raw records held by one object store of `name`, keyed as written. */
  recordsOf(name: string, storeName: string): Map<string, unknown> | undefined;
}

/** Creates a fresh, isolated fake `IDBFactory` - one per test to avoid cross-test bleed. */
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
    versionOf: (name: string) => factory.databases.get(name)?.version,
    recordsOf: (name: string, storeName: string) => factory.databases.get(name)?.stores.get(storeName)?.data,
  };
};
