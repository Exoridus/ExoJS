/**
 * Object URLs a factory created, so none outlives the factory that made it.
 *
 * An object URL keeps its blob alive until it is revoked, and a decode that
 * never settles - a load abandoned mid-flight, an element that never fires
 * either event - would otherwise leak the whole blob for the lifetime of the
 * document. Revoke each URL as soon as its consumer no longer needs it; the
 * pool is what catches the ones that never got there.
 * @internal
 */
export class ObjectUrlPool {
  private readonly _urls = new Set<string>();

  /** Creates a tracked object URL for `blob`. */
  public create(blob: Blob): string {
    const url = URL.createObjectURL(blob);

    this._urls.add(url);

    return url;
  }

  /** Revokes one URL and stops tracking it. Safe to call for a URL already revoked. */
  public revoke(url: string): void {
    if (this._urls.delete(url)) {
      URL.revokeObjectURL(url);
    }
  }

  /** Revokes every URL still tracked. */
  public revokeAll(): void {
    for (const url of this._urls) {
      URL.revokeObjectURL(url);
    }

    this._urls.clear();
  }
}
