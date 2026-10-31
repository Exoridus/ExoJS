/** Render-independent geometry notifications. @internal */
export class ShapeRevision {
  private _geometryListeners: Set<() => void> | null = null;
  /** @internal */
  public _geometryRevision = 0;

  /** @internal */
  public _subscribeGeometry(listener: () => void): () => void {
    (this._geometryListeners ??= new Set()).add(listener);

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
    this._geometryListeners?.forEach(listener => listener());
  }

  /** @internal */
  protected _releaseGeometryListeners(): void {
    this._geometryListeners = null;
  }
}
