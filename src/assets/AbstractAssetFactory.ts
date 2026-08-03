import type { AssetFactory } from './AssetFactory';

/**
 * Shared base class for all built-in {@link AssetFactory} implementations.
 *
 * Manages a pool of object URLs created during asset loading so that they can
 * be revoked in bulk when the factory is destroyed, preventing memory leaks.
 * Concrete subclasses must implement {@link process} and {@link create}; they
 * may call {@link createObjectUrl} instead of `URL.createObjectURL` directly
 * so that the URL is automatically tracked and cleaned up.
 */
export abstract class AbstractAssetFactory<T = unknown> implements AssetFactory<T> {
  protected readonly _objectUrls: string[] = [];
  public abstract readonly storageName: string;

  public abstract process(response: Response): Promise<unknown>;
  public abstract create(source: unknown, options?: unknown): Promise<T>;

  /**
   * Creates an object URL from `blob` and registers it for automatic cleanup
   * when {@link destroy} is called.
   *
   * Prefer this over calling `URL.createObjectURL` directly inside a factory
   * subclass so the URL is always tracked.
   */
  public createObjectUrl(blob: Blob): string {
    const objectUrl = URL.createObjectURL(blob);

    this._objectUrls.push(objectUrl);

    return objectUrl;
  }

  protected revokeObjectUrl(objectUrl: string): void {
    URL.revokeObjectURL(objectUrl);

    const index = this._objectUrls.indexOf(objectUrl);

    if (index !== -1) {
      this._objectUrls.splice(index, 1);
    }
  }

  /**
   * Revokes every object URL that was created via {@link createObjectUrl} and
   * clears the internal tracking pool.
   */
  public destroy(): void {
    for (const objectUrl of this._objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }

    this._objectUrls.length = 0;
  }
}
