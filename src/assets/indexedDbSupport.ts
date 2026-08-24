import { AssetCacheError, type AssetCacheOperation } from './AssetCacheError';

/** What an {@link AssetCacheError} raised from one IndexedDB call names. @internal */
export interface IndexedDbFailureContext {
  readonly operation: AssetCacheOperation;
  readonly message: string;
  readonly store?: string | undefined;
  readonly key?: string | undefined;
}

/** Wrap an arbitrary IndexedDB failure as an {@link AssetCacheError}, leaving an already-typed one alone. */
function asCacheError(context: IndexedDbFailureContext, cause: unknown): AssetCacheError {
  if (cause instanceof AssetCacheError) {
    return cause;
  }

  return new AssetCacheError({ ...context, cause });
}

/**
 * Open `name` at `version`, running `upgrade` when the schema has to change.
 *
 * `open()` throws rather than failing its request for an invalid version or in
 * a context where storage is denied, so the call cannot live inside the promise
 * executor if the rejection is to stay typed.
 * @internal
 */
export function openIndexedDb(
  name: string,
  version: number,
  upgrade: (database: IDBDatabase, transaction: IDBTransaction, oldVersion: number, newVersion: number) => void,
): Promise<IDBDatabase> {
  const failure: IndexedDbFailureContext = { operation: 'connect', message: `The database "${name}" could not be opened.` };
  let request: IDBOpenDBRequest;

  try {
    request = indexedDB.open(name, version);
  } catch (error: unknown) {
    return Promise.reject(asCacheError(failure, error));
  }

  return new Promise((resolve, reject) => {
    request.addEventListener('upgradeneeded', event => {
      const { transaction } = request;

      // The spec guarantees a versionchange transaction here; a connection that
      // has none cannot be upgraded and would leave a half-built schema.
      if (transaction === null) {
        reject(new AssetCacheError({ ...failure, message: `The database "${name}" reported no upgrade transaction.` }));

        return;
      }

      try {
        upgrade(request.result, transaction, event.oldVersion, event.newVersion ?? version);
      } catch (error: unknown) {
        // Aborting is what turns a failed migration into a failed open rather
        // than leaving a half-built schema behind for the next session.
        transaction.abort();
        reject(asCacheError(failure, error));
      }
    });

    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(asCacheError(failure, request.error ?? undefined)));
    request.addEventListener('blocked', () =>
      reject(new AssetCacheError({ ...failure, message: `Opening the database "${name}" is blocked by another connection holding an older version.` })),
    );
  });
}

/** Resolve with an IndexedDB request's result, or reject with a typed failure. @internal */
export function requestResult<T>(request: IDBRequest<T>, failure: IndexedDbFailureContext): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(asCacheError(failure, request.error ?? undefined)));
  });
}

/**
 * Resolve once `transaction` has COMMITTED.
 *
 * A write is not durable when its `IDBRequest` succeeds - the transaction can
 * still abort afterwards, on a quota failure or on any other request in the
 * same transaction failing. Resolving on the request would let a caller await a
 * write and then miss reading it back.
 * @internal
 */
export function transactionComplete(transaction: IDBTransaction, failure: IndexedDbFailureContext): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => reject(asCacheError(failure, transaction.error ?? undefined)));
    transaction.addEventListener('abort', () =>
      reject(asCacheError({ ...failure, message: `${failure.message} The transaction was aborted.` }, transaction.error ?? undefined)),
    );
  });
}
