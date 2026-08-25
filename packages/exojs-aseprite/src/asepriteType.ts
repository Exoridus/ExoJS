import type { AssetFactory, AssetSourceCodec, Texture } from '@codexo/exojs';
import { Asset, AssetType, jsonSourceCodec } from '@codexo/exojs';

/** The JSON codec, narrowed to the two acquisition halves this type reuses verbatim. */
const jsonStringCodec = jsonSourceCodec as Required<AssetSourceCodec<unknown, string>>;

import type { AsepriteData } from './AsepriteData';
import { AsepriteSheet } from './AsepriteSheet';

// ── URL resolution ───────────────────────────────────────────────────────────

/** Matches references that are already absolute: scheme, `//`, `/`, data/blob. */
const absoluteRefPattern = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i;

/** Matches a base that has an explicit scheme (absolute URL). */
const absoluteBasePattern = /^[a-z][a-z\d+.-]*:/i;

/** Synthetic origin used to borrow `URL`'s `../`/`./` collapsing. */
const syntheticOrigin = 'https://exojs.invalid/';

/**
 * Resolves `ref` (the image path read from an Aseprite JSON file) relative to
 * `base` (the resolved location of the JSON file itself).
 *
 * - Absolute refs (scheme, `//`, `/`, `data:`, `blob:`) are returned as-is.
 * - Absolute bases delegate to `new URL(ref, base).href`.
 * - Relative bases use a synthetic origin to collapse `./` and `../` segments,
 *   then strips the origin from the result.
 */
const resolveAsepriteUrl = (ref: string, base: string): string => {
  if (absoluteRefPattern.test(ref)) {
    return ref;
  }

  if (absoluteBasePattern.test(base)) {
    return new URL(ref, base).href;
  }

  const resolved = new URL(ref, syntheticOrigin + base.replace(/^\/+/, ''));
  const relative = resolved.href.slice(syntheticOrigin.length);

  // A root-relative base must produce a root-relative result again - dropping
  // the leading slash would make the browser re-resolve the reference against
  // the document base URL (e.g. `/site/assets/x.png` → `/site/site/assets/...`).
  return base.startsWith('/') ? `/${relative}` : relative;
};

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Thrown when an Aseprite JSON document does not match the expected shape.
 * `source` is the URL of the file being parsed.
 */
export class AsepriteFormatError extends Error {
  public readonly source: string;

  public constructor(source: string, message: string) {
    super(`[AsepriteFormatError] ${source}: ${message}`);
    this.name = 'AsepriteFormatError';
    this.source = source;
  }
}

/**
 * Validates an `unknown` value against the minimum required Aseprite JSON
 * shape and narrows it to {@link AsepriteData}. Throws {@link AsepriteFormatError}
 * on any mismatch.
 */
const validateAsepriteData = (raw: unknown, source: string): AsepriteData => {
  if (typeof raw !== 'object' || raw === null) {
    throw new AsepriteFormatError(source, 'root must be an object');
  }

  const doc = raw as Record<string, unknown>;

  if (!('frames' in doc)) {
    throw new AsepriteFormatError(source, 'missing required field "frames"');
  }

  if (!('meta' in doc) || typeof doc.meta !== 'object' || doc.meta === null) {
    throw new AsepriteFormatError(source, 'missing required field "meta"');
  }

  const meta = doc.meta as Record<string, unknown>;

  if (typeof meta.image !== 'string' || meta.image.length === 0) {
    throw new AsepriteFormatError(source, '"meta.image" must be a non-empty string');
  }

  const frames = doc.frames;

  if (!Array.isArray(frames) && (typeof frames !== 'object' || frames === null)) {
    throw new AsepriteFormatError(source, '"frames" must be an array or an object');
  }

  return doc as unknown as AsepriteData;
};

/**
 * Aseprite JSON exports, together with the packed sheet they reference.
 *
 * The image URL is read from `meta.image` and resolved against the JSON file's
 * own location; the texture is claimed by this sheet's dependency scope, so it
 * lives exactly as long as the sheet does.
 */
export class AsepriteAssetType extends AssetType<AsepriteData, AsepriteSheet, undefined, string> {
  public readonly id = 'asepriteSheet';
  public override readonly _token = AsepriteSheet;
  // Stored as the text that arrived, like any JSON: a parsed value round-trips
  // through key order and number formatting the response never had.
  public override readonly codec: AssetSourceCodec<AsepriteData, string> = {
    fromResponse: (response, context) => jsonStringCodec.fromResponse(response, context),
    fromBytes: (bytes, context) => jsonStringCodec.fromBytes(bytes, context),
    decode: (stored, context) => Promise.resolve(validateAsepriteData(JSON.parse(stored), context.locator)),
  };

  public createFactory(): AssetFactory<AsepriteData, AsepriteSheet> {
    return {
      async create(source, context) {
        const texture: Texture = await context.dependencies.load(Asset.type('texture', resolveAsepriteUrl(source.meta.image, context.source)));

        return AsepriteSheet.parse(source, texture);
      },
    };
  }
}

/** The Aseprite sheet asset type. Install it through {@link asepriteExtension}. */
export const asepriteType = new AsepriteAssetType();
