/**
 * Canonical asset identity: the single key every fetch, cache lookup, residency
 * entry and ownership claim is keyed by.
 *
 * A canonical key is `typeId | locator` plus, when the asset type declares one,
 * `| discriminator`. The core always owns `type + locator`; a handler may only
 * contribute the additional identity-relevant part through
 * `AssetHandler.getIdentityDiscriminator`, so an extension cannot build a
 * parallel identity space.
 *
 * Aliases, catalog keys and container entry names are NAMES for a canonical
 * resource. They never take part in its identity.
 */

import type { AssetConstructor } from './FactoryRegistry';

/**
 * A canonicalized asset source: `url:` followed by the fully resolved URL, with
 * the loader base path applied, `.` and `..` collapsed, and the fragment
 * removed. `blob:` and `data:` sources carry their own absolute identity and
 * pass through unchanged.
 */
export type AssetLocator = string;

/** The identity every residency, claim and in-flight entry is keyed by. */
export type CanonicalAssetKey = string;

/**
 * A request resolved to its one canonical identity. Produced once per entry
 * point, before any fetch starts, and passed down instead of a
 * `(type, source)` pair so no layer can re-derive a different identity.
 * @internal
 */
export interface CanonicalAsset {
  readonly key: CanonicalAssetKey;
  readonly locator: AssetLocator;
  readonly type: AssetConstructor;
  /** The source string as the caller wrote it. Used for fetching and diagnostics, never for identity. */
  readonly source: string;
}

/** Sources that already carry their own absolute, opaque identity and must never be joined onto a base path or normalized. */
function isOpaqueSource(source: string): boolean {
  return source.startsWith('blob:') || source.startsWith('data:');
}

/** Sources that resolve without the loader base path: absolute URLs, protocol-relative, and root-relative paths. */
function isAbsoluteSource(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://') || source.startsWith('//') || source.startsWith('/');
}

/**
 * Collapse `.` and `..` segments and drop the fragment, leaving scheme,
 * authority and query untouched.
 *
 * The fragment is dropped because it is never transmitted on an HTTP fetch: two
 * sources differing only in their fragment address the same bytes and must
 * resolve to one identity. A type whose fragment IS semantic still receives the
 * raw source and can carry it in its identity discriminator.
 */
function isSchemeChar(code: number, first: boolean): boolean {
  const isLetter = (code >= 97 && code <= 122) || (code >= 65 && code <= 90);

  if (first) {
    return isLetter;
  }

  // digits, '+', '-', '.'
  return isLetter || (code >= 48 && code <= 57) || code === 43 || code === 45 || code === 46;
}

/**
 * Length of the leading `scheme:` plus `//authority` of `path`, or `0` when it
 * has neither. Scanned rather than matched: a regex for this shape needs nested
 * quantifiers, and the input is an arbitrary caller-supplied string.
 */
function prefixLength(path: string): number {
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
}

function normalizeUrl(url: string): string {
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
}

/**
 * The URL a source is actually fetched from. Shares its whole resolution path
 * with {@link canonicalizeSource}, so the fetched URL and the identity a load is
 * keyed by can never drift apart.
 */
export function resolveAssetUrl(basePath: string, source: string): string {
  if (isOpaqueSource(source)) {
    return source;
  }

  return normalizeUrl(isAbsoluteSource(source) ? source : `${basePath}${source}`);
}

/** The canonical locator for a fetchable source. */
export function canonicalizeSource(basePath: string, source: string): AssetLocator {
  return `url:${resolveAssetUrl(basePath, source)}`;
}

/** Compose the canonical key for a type id, a locator, and an optional handler-supplied discriminator. */
export function canonicalAssetKey(typeId: number, locator: AssetLocator, discriminator?: string): CanonicalAssetKey {
  return discriminator === undefined || discriminator === '' ? `${typeId}|${locator}` : `${typeId}|${locator}|${discriminator}`;
}
