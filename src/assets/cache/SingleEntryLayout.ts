import type { CacheLayout, CacheLayoutContext } from './CacheLayout';
import type { CacheReadResult } from './CacheReadResult';

/** The record name a single-entry representation occupies. */
const recordName = 'value';

/**
 * {@link CacheLayout} for a representation that occupies one record.
 *
 * This is what almost every asset type wants: the codec produced one value,
 * and the cache keeps that one value. It is the default an {@link AssetType}
 * carries, so a type that needs nothing else declares nothing at all.
 *
 * Raise the version when the codec's stored representation changes shape.
 * Records written under the old version stop being found and are re-acquired.
 *
 * @example
 * ```ts
 * class WorldAssetType extends AssetType<WorldData, World, undefined, string> {
 *   public override readonly layout = SingleEntryLayout.version<string>(2);
 * }
 * ```
 * @advanced
 */
export class SingleEntryLayout<Stored = unknown> implements CacheLayout<Stored> {
  public readonly version: number;

  private constructor(version: number) {
    this.version = version;
  }

  /**
   * The single-entry layout at `version`.
   *
   * Instances are shared per version, so declaring a layout on an asset type
   * costs nothing per type.
   */
  public static version<Stored = unknown>(version: number): SingleEntryLayout<Stored> {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`SingleEntryLayout.version() expects a positive integer, got ${String(version)}.`);
    }

    let layout = cachedVersions.get(version);

    if (layout === undefined) {
      layout = new SingleEntryLayout(version);
      cachedVersions.set(version, layout);
    }

    return layout as SingleEntryLayout<Stored>;
  }

  public read(context: CacheLayoutContext): Promise<CacheReadResult<Stored>> {
    return context.read(recordName) as Promise<CacheReadResult<Stored>>;
  }

  public write(stored: Stored, context: CacheLayoutContext): Promise<void> {
    return context.write(recordName, stored);
  }
}

const cachedVersions = new Map<number, SingleEntryLayout>();
