// Relative-path resolution for Tiled source references (TMJ → TSJ, TMJ/TSJ →
// image). Tiled stores every cross-file reference as a path relative to the
// file that contains it; ExoJS asset sources are themselves often relative
// (resolved against an asset root configured outside the Loader), so plain
// `new URL(ref, base)` cannot be used directly when `base` has no scheme.

/** Matches references that are already absolute and must not be re-resolved: scheme:, protocol-relative `//`, root-relative `/`, and data/blob URLs. */
const ABSOLUTE_REF = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i;

/** Matches a base that is itself an absolute URL with a scheme. */
const ABSOLUTE_BASE = /^[a-z][a-z\d+.-]*:/i;

/** Synthetic origin used to borrow `URL`'s `../`/`./` collapsing for relative bases. */
const SYNTHETIC_ORIGIN = 'https://exojs.invalid/';

/**
 * Resolves `ref` (a path read from a Tiled JSON file, e.g. a tileset
 * `source` or an `image`) relative to `base` (the resolved location of the
 * file that referenced it).
 *
 * - If `ref` is already absolute (has a scheme, is protocol- or
 *   root-relative, or is a `data:`/`blob:` URL), it is returned unchanged.
 * - If `base` is an absolute URL, standard `new URL(ref, base)` resolution
 *   is used.
 * - Otherwise both `ref` and `base` are relative ExoJS asset paths; `../`
 *   and `./` segments are collapsed via a synthetic origin and the result is
 *   returned relative again.
 *
 * Query strings and fragments on `ref` are preserved.
 *
 * @internal
 */
export function resolveTiledUrl(ref: string, base: string): string {
  if (ABSOLUTE_REF.test(ref)) {
    return ref;
  }

  if (ABSOLUTE_BASE.test(base)) {
    return new URL(ref, base).href;
  }

  const resolved = new URL(ref, SYNTHETIC_ORIGIN + base.replace(/^\/+/, ''));

  return resolved.href.slice(SYNTHETIC_ORIGIN.length);
}
