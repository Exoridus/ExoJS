// Relative-path resolution for LDtk source references (.ldtk → tileset image,
// .ldtk → external .ldtkl level). LDtk stores every cross-file reference as a
// path relative to the file that contains it; ExoJS asset sources are themselves
// often relative (resolved against an asset root configured outside the Loader),
// so plain `new URL(ref, base)` cannot be used directly when `base` has no
// scheme — it throws `Invalid URL`. Mirrors the Tiled adapter's `resolveTiledUrl`.

/** Matches references that are already absolute and must not be re-resolved: scheme:, protocol-relative `//`, root-relative `/`, and data/blob URLs. */
const ABSOLUTE_REF = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i;

/** Matches a base that is itself an absolute URL with a scheme. */
const ABSOLUTE_BASE = /^[a-z][a-z\d+.-]*:/i;

/** Synthetic origin used to borrow `URL`'s `../`/`./` collapsing for relative bases. */
const SYNTHETIC_ORIGIN = 'https://exojs.invalid/';

/**
 * Resolves `ref` (a path read from an LDtk file, e.g. a tileset `relPath` or a
 * level `externalRelPath`) relative to `base` (the resolved location of the
 * file that referenced it).
 *
 * - If `ref` is already absolute (scheme, protocol- or root-relative, or a
 *   `data:`/`blob:` URL), it is returned unchanged.
 * - If `base` is an absolute URL, standard `new URL(ref, base)` resolution is
 *   used.
 * - Otherwise both are relative ExoJS asset paths; `../`/`./` segments are
 *   collapsed via a synthetic origin and the result is returned relative again.
 *
 * @internal
 */
export function resolveLdtkUrl(ref: string, base: string): string {
  if (ABSOLUTE_REF.test(ref)) {
    return ref;
  }

  if (ABSOLUTE_BASE.test(base)) {
    return new URL(ref, base).href;
  }

  const resolved = new URL(ref, SYNTHETIC_ORIGIN + base.replace(/^\/+/, ''));
  const relative = resolved.href.slice(SYNTHETIC_ORIGIN.length);

  // A root-relative base must produce a root-relative result again — dropping
  // the leading slash would make the browser re-resolve the reference against
  // the document base URL (e.g. `/site/assets/x.png` → `/site/site/assets/…`).
  return base.startsWith('/') ? `/${relative}` : relative;
}
