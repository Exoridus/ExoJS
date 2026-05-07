/**
 * Low-level key/value database abstraction used by {@link CacheStore}
 * implementations.
 *
 * Data is organised into named object stores (`type`) that act as namespaces,
 * each holding entries keyed by `name`. {@link IndexedDbDatabase} is the
 * built-in implementation; custom backends can be provided by implementing
 * this interface and wrapping it in a {@link CacheStore}.
 */
export interface Database {
    /** Human-readable database identifier, typically an application name. */
    readonly name: string;
    /** Schema version used during `upgradeneeded` migrations. */
    readonly version: number;
    /** Whether a live connection to the underlying database is open. */
    readonly connected: boolean;

    /**
     * Opens the database connection, running any pending schema migrations.
     * Resolves to `true` when the connection is ready; rejects on error.
     * Calling this when already connected is a no-op that resolves `true`.
     */
    connect(): Promise<boolean>;

    /**
     * Closes the live database connection and resets the connected state.
     * Always resolves `true`; safe to call when not connected.
     */
    disconnect(): Promise<boolean>;

    /**
     * Retrieves the entry with the given `name` from the `type` object store,
     * or `null` if no such entry exists.
     */
    load<T = unknown>(type: string, name: string): Promise<T | null>;

    /**
     * Persists `data` under `name` within the `type` object store, replacing
     * any existing entry with the same name.
     */
    save(type: string, name: string, data: unknown): Promise<void>;

    /**
     * Deletes the entry with the given `name` from the `type` object store.
     * Resolves `true` on success.
     */
    delete(type: string, name: string): Promise<boolean>;

    /**
     * Removes all entries from the `type` object store without dropping the
     * store itself. Resolves `true` on success.
     */
    clearStorage(type: string): Promise<boolean>;

    /**
     * Disconnects and then permanently deletes the entire database.
     * Resolves `true` on success.
     */
    deleteStorage(): Promise<boolean>;

    /**
     * Synchronously closes any open handles without waiting for pending
     * transactions to complete. Prefer {@link disconnect} for graceful teardown.
     */
    destroy(): void;
}
