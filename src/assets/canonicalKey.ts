/**
 * Asset identity, in two separate dimensions.
 *
 * A {@link ResourceKey} answers "is this the same runtime resource?" and is what
 * every residency entry, in-flight fetch and ownership claim is keyed by. A
 * {@link SourceKey} answers "do these requests represent the same acquired
 * source data?" - two distinct resources built from one download share it.
 *
 * Both are derived from the same canonical locator, so the URL a load fetches
 * and the identities it is keyed by can never drift apart. The core always owns
 * the locator; a type may only widen a key through its own identity hooks, so
 * no extension can build a parallel identity space.
 *
 * Aliases, catalog keys and container entry names are NAMES for a resource.
 * They never take part in its identity.
 */

import type { AssetConstructor } from './AssetConstructor';

/**
 * A canonicalized asset source: `url:` followed by the fully resolved URL, with
 * the loader base path applied, `.` and `..` collapsed, and the fragment
 * removed. `blob:` and `data:` sources carry their own absolute identity and
 * pass through unchanged.
 */
export type AssetLocator = string;

/**
 * The identity of one runtime resource: every residency entry, in-flight fetch
 * and ownership claim is keyed by it.
 *
 * Composed of the asset type's identity, the {@link SourceKey} the resource is
 * built from, and - when the type declares one - a resource discriminator
 * covering every option that changes the produced resource. Two requests that
 * differ only in an option the type does not treat as resource-relevant resolve
 * to one key and are served by one resource.
 *
 * Containing the source key rather than the bare locator is what keeps the two
 * dimensions consistent: distinct source data can never collapse onto one
 * resident resource, whatever a type's resource discriminator says.
 */
export type ResourceKey = string;

/**
 * The identity of the source data a request acquires.
 *
 * Composed of the canonical locator and - when the type declares one - a source
 * discriminator covering only what changes the acquired bytes (a locale, a
 * content variant). It deliberately carries no asset type and no resource
 * discriminator: two {@link ResourceKey}s that differ only in how the same
 * download is interpreted share one `SourceKey`.
 *
 * How an acquired representation is stored is a separate question again, and is
 * not part of this key.
 */
export type SourceKey = string;

/**
 * A request resolved to its one canonical identity. Produced once per entry
 * point, before any fetch starts, and passed down instead of a
 * `(type, source)` pair so no layer can re-derive a different identity.
 * @internal
 */
export interface CanonicalAsset {
  readonly key: ResourceKey;
  readonly sourceKey: SourceKey;
  readonly locator: AssetLocator;
  readonly type: AssetConstructor;
  /** The source string as the caller wrote it. Used for fetching and diagnostics, never for identity. */
  readonly source: string;
}

/** Sources that already carry their own absolute, opaque identity and must never be joined onto a base path or normalized. */
const isOpaqueSource = (source: string): boolean => source.startsWith('blob:') || source.startsWith('data:');

/** Sources that resolve without the loader base path: absolute URLs, protocol-relative, and root-relative paths. */
const isAbsoluteSource = (source: string): boolean =>
  source.startsWith('http://') || source.startsWith('https://') || source.startsWith('//') || source.startsWith('/');

/**
 * Collapse `.` and `..` segments and drop the fragment, leaving scheme,
 * authority and query untouched.
 *
 * The fragment is dropped because it is never transmitted on an HTTP fetch: two
 * sources differing only in their fragment address the same bytes and must
 * resolve to one identity. A type whose fragment IS semantic still receives the
 * raw source and can carry it in its identity discriminator.
 */
const isSchemeChar = (code: number, first: boolean): boolean => {
  const isLetter = (code >= 97 && code <= 122) || (code >= 65 && code <= 90);

  if (first) {
    return isLetter;
  }

  // digits, '+', '-', '.'
  return isLetter || (code >= 48 && code <= 57) || code === 43 || code === 45 || code === 46;
};

/**
 * Length of the leading `scheme:` plus `//authority` of `path`, or `0` when it
 * has neither. Scanned rather than matched: a regex for this shape needs nested
 * quantifiers, and the input is an arbitrary caller-supplied string.
 */
const prefixLength = (path: string): number => {
  let index = 0;
  const colon = path.indexOf(':');

  if (colon > 0) {
    let isScheme = true;

    for (let i = 0; i < colon; i++) {
      if (!isSchemeChar(path.charCodeAt(i), i === 0)) {
        isScheme = false;
        break;
      }
    }

    if (isScheme) {
      index = colon + 1;
    }
  }

  if (!path.startsWith('//', index)) {
    return index;
  }

  for (let i = index + 2; i < path.length; i++) {
    const char = path[i];

    if (char === '/' || char === '?' || char === '#') {
      return i;
    }
  }

  return path.length;
};

const normalizeUrl = (url: string): string => {
  const fragmentStart = url.indexOf('#');
  const withoutFragment = fragmentStart === -1 ? url : url.slice(0, fragmentStart);
  const queryStart = withoutFragment.indexOf('?');
  const path = queryStart === -1 ? withoutFragment : withoutFragment.slice(0, queryStart);
  const query = queryStart === -1 ? '' : withoutFragment.slice(queryStart);

  const prefix = path.slice(0, prefixLength(path));
  const rest = path.slice(prefix.length);
  const rooted = rest.startsWith('/');
  const segments: string[] = [];

  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment !== '..') {
      segments.push(segment);
      continue;
    }

    const last = segments[segments.length - 1];

    if (last !== undefined && last !== '..') {
      segments.pop();
    }
    // A `..` that would escape the root is dropped, mirroring how a browser
    // resolves it. Only a relative source with nothing above it keeps the
    // segment, so `../sibling.png` still addresses the sibling directory.
    else if (!rooted && prefix === '') {
      segments.push('..');
    }
  }

  const trailingSlash = rest.length > 1 && rest.endsWith('/');
  const body = segments.join('/') + (trailingSlash && segments.length > 0 ? '/' : '');

  return `${prefix}${rooted ? '/' : ''}${body}${query}`;
};

/**
 * The URL a source is actually fetched from. Shares its whole resolution path
 * with {@link canonicalizeSource}, so the fetched URL and the identity a load is
 * keyed by can never drift apart.
 */
export const resolveAssetUrl = (basePath: string, source: string): string => {
  if (isOpaqueSource(source)) {
    return source;
  }

  return normalizeUrl(isAbsoluteSource(source) ? source : `${basePath}${source}`);
};

/** The canonical locator for a fetchable source. */
export const canonicalizeSource = (basePath: string, source: string): AssetLocator => `url:${resolveAssetUrl(basePath, source)}`;

/** Compose the {@link ResourceKey} for a type identity, the source it is built from, and an optional resource discriminator. */
export const resourceKey = (typeId: string, source: SourceKey, discriminator?: string): ResourceKey =>
  discriminator === undefined || discriminator === '' ? `${typeId}|${source}` : `${typeId}|${source}|${discriminator}`;

/**
 * Compose the {@link SourceKey} for a locator and an optional source
 * discriminator. Type-free by construction: whichever asset type asked for it,
 * one locator plus one source variant is one acquisition.
 */
export const sourceKey = (locator: AssetLocator, discriminator?: string): SourceKey =>
  discriminator === undefined || discriminator === '' ? locator : `${locator}|${discriminator}`;
