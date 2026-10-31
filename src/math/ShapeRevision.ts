/**
 * Base of the shapes whose geometry edits Graphics can follow. It adds no
 * public members; its subscription hooks are engine-internal.
 */
export class ShapeRevision {
  private _geometryListeners: Map<() => void, (() => void) | null> | null = null;
  /** @internal */
  public _geometryRevision = 0;

  /**
   * `released` runs once when the shape is destroyed; the subscription is
   * already gone by then.
   * @internal
   */
  public _subscribeGeometry(listener: () => void, released: (() => void) | null = null): () => void {
    (this._geometryListeners ??= new Map()).set(listener, released);

    return () => {
      this._geometryListeners?.delete(listener);

      if (this._geometryListeners?.size === 0) {
        this._geometryListeners = null;
      }
    };
  }

  /** @internal */
  protected _notifyGeometry(): void {
    this._geometryRevision++;
    this._geometryListeners?.forEach((_released, listener) => listener());
  }

  /** @internal */
  protected _releaseGeometryListeners(): void {
    const listeners = this._geometryListeners;

    if (listeners === null) {
      return;
    }

    const released = [...listeners.values()];

    // Clearing the live map also stops a notification that is still iterating
    // it, so no subscriber sees a change after the shape was destroyed.
    listeners.clear();
    this._geometryListeners = null;

    let failure: unknown;

    for (const release of released) {
      try {
        release?.();
      } catch (error) {
        failure ??= error;
      }
    }

    if (failure !== undefined) {
      throw failure instanceof Error ? failure : new Error('Releasing shape subscribers failed.', { cause: failure });
    }
  }
}
