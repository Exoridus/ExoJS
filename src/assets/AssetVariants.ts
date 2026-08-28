import type { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

/**
 * What the running device can accept, as variant rules see it.
 *
 * Filled from the live render backend once it is up - `textureFormats` is
 * {@link RenderBackend.supportedTextureFormats} and `resolution` is its
 * `rootResolution`. Before that it is the conservative empty profile, so a load
 * started before the backend exists picks the unconditional fallback rather
 * than a format nothing has confirmed.
 * @advanced
 */
export interface AssetVariantProfile {
  /**
   * Compressed texture formats the backend can sample, most preferred first.
   * The order is the selection order, so it decides which of several supported
   * candidates wins. Empty on a device with no compressed-format support.
   */
  readonly textureFormats: readonly CompressedTextureFormat[];
  /** Device pixels per logical unit the application renders at. */
  readonly resolution: number;
}

/**
 * One candidate representation of a logical asset source.
 *
 * A candidate is eligible when every condition it states holds for the current
 * {@link AssetVariantProfile}. A candidate that states none is the
 * unconditional fallback and is always eligible - declare one, or a device that
 * matches nothing falls back to the logical source itself.
 * @advanced
 */
export interface AssetVariant {
  /** Source to load when this candidate wins. Resolved against the loader base path like any other. */
  readonly source: string;
  /** Eligible only when the profile lists this format. */
  readonly textureFormat?: CompressedTextureFormat;
  /** Eligible only when the profile renders at this density or higher. */
  readonly resolution?: number;
}

/** The profile a set starts on: nothing confirmed, logical density. */
const conservativeProfile: AssetVariantProfile = Object.freeze({ textureFormats: Object.freeze([]), resolution: 1 });

/**
 * Per-device selection between several files that stand for one logical asset.
 *
 * Without this layer a path is a path: one URL, one set of bytes, on every
 * device. That is the wrong shape for two things a real project needs - a
 * texture shipped once per compressed format family (no GPU supports them all)
 * and once per display density - because the choice can only be made where the
 * device is known, which is at load time.
 *
 * Selection happens before the source is canonicalized, so asset identity is
 * keyed on the file that was actually chosen. Two devices picking different
 * candidates therefore get different cache entries instead of one entry whose
 * contents depend on who wrote it last.
 *
 * A source with no rule resolves to itself. Nothing is registered by default,
 * so an application that never calls {@link define} pays one map lookup per
 * load and nothing else.
 *
 * @example
 * ```ts
 * app.loader.variants.define('terrain.png', [
 *   { source: 'terrain.bc7.ktx2', textureFormat: CompressedTextureFormat.Bc7RgbaUnorm },
 *   { source: 'terrain.astc.ktx2', textureFormat: CompressedTextureFormat.Astc4x4Unorm },
 *   { source: 'terrain@2x.png', resolution: 2 },
 *   { source: 'terrain.png' },
 * ]);
 *
 * // Loads whichever of the four this device can actually use.
 * const terrain = app.loader.load('terrain.png');
 * ```
 * @advanced
 */
export class AssetVariantSet {
  private readonly _rules = new Map<string, readonly AssetVariant[]>();
  private _profile: AssetVariantProfile = conservativeProfile;

  /**
   * Device capabilities selection is measured against. Written by the
   * {@link Application} once the backend is initialized; assign it directly to
   * override that - for a deterministic test, or to pin a format set a
   * build already targets.
   *
   * Changing it does not re-resolve assets that are already resident: their
   * identity was fixed by the profile in force when they were requested.
   */
  public get profile(): AssetVariantProfile {
    return this._profile;
  }

  public set profile(value: AssetVariantProfile) {
    this._profile = value;
  }

  /**
   * Declare the candidates for one logical source, replacing any previous rule
   * for it.
   *
   * `source` is the name callers keep using; it never has to exist as a file.
   * Order the candidates most-wanted first: it breaks ties, though a supported
   * compressed format outranks declaration order (see {@link resolve}).
   */
  public define(source: string, variants: readonly AssetVariant[]): this {
    this._rules.set(source, variants);

    return this;
  }

  /** Drop the rule for `source`, so it resolves to itself again. */
  public undefine(source: string): this {
    this._rules.delete(source);

    return this;
  }

  /** The candidates declared for `source`, or `undefined`. */
  public candidates(source: string): readonly AssetVariant[] | undefined {
    return this._rules.get(source);
  }

  /** Forget every rule. The profile is left alone - it describes the device, not the content. */
  public clear(): this {
    this._rules.clear();

    return this;
  }

  /**
   * The source a load of `source` should actually fetch.
   *
   * Among the eligible candidates the one carrying the most preferred
   * compressed format wins, then the highest density, then the earliest
   * declared. Format outranks density deliberately: it is what decides VRAM and
   * transfer cost, and a project that wants density to dominate simply declares
   * only the candidates it wants chosen.
   *
   * Returns `source` unchanged when it has no rule, and when it has one whose
   * candidates are all ineligible.
   */
  public resolve(source: string): string {
    const candidates = this._rules.get(source);

    if (candidates === undefined) {
      return source;
    }

    const { textureFormats, resolution } = this._profile;
    // An uncompressed candidate ranks behind every supported format rather than
    // ahead of an unsupported one, so `length` (not -1) is its rank.
    const uncompressedRank = textureFormats.length;
    let best: AssetVariant | undefined;
    let bestRank = Number.POSITIVE_INFINITY;
    let bestResolution = -1;

    for (const candidate of candidates) {
      if (candidate.resolution !== undefined && candidate.resolution > resolution) {
        continue;
      }

      let rank = uncompressedRank;

      if (candidate.textureFormat !== undefined) {
        rank = textureFormats.indexOf(candidate.textureFormat);

        if (rank === -1) {
          continue;
        }
      }

      const candidateResolution = candidate.resolution ?? 1;

      if (rank < bestRank || (rank === bestRank && candidateResolution > bestResolution)) {
        best = candidate;
        bestRank = rank;
        bestResolution = candidateResolution;
      }
    }

    return best?.source ?? source;
  }
}
