// Relative-path resolution for Aseprite image references (JSON → PNG).
// Mirrors the approach used in @codexo/exojs-tiled: Aseprite stores the image
// path relative to the JSON file; asset sources are often themselves relative,
// so plain `new URL(ref, base)` cannot be used when `base` has no scheme.

import { defineAsset, Texture } from '@codexo/exojs';
import type { AssetHandler } from '@codexo/exojs/extensions';

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
function resolveAsepriteUrl(ref: string, base: string): string {
  if (absoluteRefPattern.test(ref)) {
    return ref;
  }

  if (absoluteBasePattern.test(base)) {
    return new URL(ref, base).href;
  }

  const resolved = new URL(ref, syntheticOrigin + base.replace(/^\/+/, ''));
  const relative = resolved.href.slice(syntheticOrigin.length);

  // A root-relative base must produce a root-relative result again — dropping
  // the leading slash would make the browser re-resolve the reference against
  // the document base URL (e.g. `/site/assets/x.png` → `/site/site/assets/…`).
  return base.startsWith('/') ? `/${relative}` : relative;
}

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
function validateAsepriteData(raw: unknown, source: string): AsepriteData {
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
}

// ── Asset binding ─────────────────────────────────────────────────────────────

/**
 * Declarative asset binding for {@link AsepriteSheet}.
 *
 * `loader.load(AsepriteSheet, 'hero.aseprite.json')` fetches and validates the
 * Aseprite JSON export, resolves the packed image URL from `meta.image`
 * (relative to the JSON source), loads the {@link Texture} via the Loader's
 * sub-load deduplication, and constructs a fully-parsed {@link AsepriteSheet}.
 *
 * The `aseprite` type name enables the asset-config shorthand:
 * `{ type: 'aseprite', source: 'hero.aseprite.json' }`.
 */
export const asepriteBinding = defineAsset({
  type: AsepriteSheet,
  kind: 'asepriteSheet',
  create() {
    return {
      async load(req, ctx): Promise<AsepriteSheet> {
        const raw = await ctx.fetchJson(req.source);
        const data = validateAsepriteData(raw, req.source);
        const imageUrl = resolveAsepriteUrl(data.meta.image, req.source);
        const texture = await ctx.loader.load(Texture.of(imageUrl));

        return AsepriteSheet.parse(data, texture);
      },
    } satisfies AssetHandler<AsepriteSheet>;
  },
});
