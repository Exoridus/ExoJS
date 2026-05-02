// Source-of-truth for the version dropdown. Reads released versions from
// the npm registry — the canonical "what's installable" list. The "current"
// entry is a virtual id for whatever HEAD-of-main the playground was built
// from. Released versions load their library bundle from jsDelivr (which
// serves the same npm tarballs) and their example sources from
// raw.githubusercontent.com at the matching tag. See example-store.ts and
// preview.html for the loader sides.
//
// Versions tagged with anything other than `latest` (e.g., `legacy-2x`) and
// versions with a `deprecated` field on the registry are filtered out so the
// dropdown never offers a release the user shouldn't be using.

const REGISTRY_URL = 'https://registry.npmjs.org/@codexo/exojs';
const CACHE_KEY = 'exojs-version-catalog-v2';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — releases don't appear that often.

export const CURRENT_VERSION_ID = 'current';

export type VersionTrack = 'stable' | 'beta' | 'legacy';

export interface VersionInfo {
  id: string;
  track: VersionTrack;
  releasedAt?: string;
  summary?: string;
  latest?: boolean;
}

export interface VersionCatalog {
  latestStable: string;
  versions: ReadonlyArray<VersionInfo>;
}

interface NpmRegistryVersionEntry {
  version: string;
  deprecated?: string;
}

interface NpmRegistryDocument {
  name?: string;
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, NpmRegistryVersionEntry>;
  time?: Record<string, string>;
}

interface CachedCatalog {
  storedAt: number;
  catalog: VersionCatalog;
}

let _catalog: VersionCatalog | null = null;
let _loadError: string | null = null;

const _loadListeners = new Set<() => void>();

const currentEntry: VersionInfo = {
  id: CURRENT_VERSION_ID,
  track: 'stable',
  summary: 'Current development build',
  latest: false,
};

export function hasVersions(): boolean {
  return _catalog !== null && _catalog.versions.length > 0;
}

export function getVersions(): ReadonlyArray<VersionInfo> {
  return _catalog?.versions ?? [];
}

export function getLatestStableId(): string | null {
  return _catalog?.latestStable ?? null;
}

export function getVersionById(id: string | null | undefined): VersionInfo | null {
  if (!id) return null;
  return _catalog?.versions.find(version => version.id === id) ?? null;
}

export function isCurrentVersion(id: string | null | undefined): boolean {
  return id === CURRENT_VERSION_ID;
}

export function getVersionLoadError(): string | null {
  return _loadError;
}

export function onVersionsLoaded(callback: () => void): () => void {
  _loadListeners.add(callback);
  return () => _loadListeners.delete(callback);
}

function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map(n => parseInt(n, 10) || 0);
  const partsB = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = partsA[i] ?? 0;
    const db = partsB[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function readCache(): VersionCatalog | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedCatalog;
    if (Date.now() - cached.storedAt > CACHE_TTL_MS) return null;
    return cached.catalog;
  } catch {
    return null;
  }
}

function writeCache(catalog: VersionCatalog): void {
  try {
    const payload: CachedCatalog = { storedAt: Date.now(), catalog };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage quota or disabled — silently ignore; a fresh fetch on the
    // next reload is acceptable.
  }
}

function buildCatalog(doc: NpmRegistryDocument): VersionCatalog {
  const distTags = doc['dist-tags'] ?? {};
  const latestId = distTags.latest;

  // Build a set of version ids that are pinned to a non-`latest` dist-tag
  // (e.g., `legacy-2x: 2.1.2`). Those are explicitly off the canonical line
  // and should not appear in the dropdown.
  const pinnedToNonLatest = new Set<string>();
  for (const [tag, id] of Object.entries(distTags)) {
    if (tag === 'latest') continue;
    pinnedToNonLatest.add(id);
  }

  const ids = Object.entries(doc.versions ?? {})
    .filter(([id, meta]) => {
      if (typeof meta.deprecated === 'string') return false;
      if (pinnedToNonLatest.has(id)) return false;
      return true;
    })
    .map(([id]) => id)
    .sort((a, b) => compareSemver(b, a)); // descending: newest first

  const released: Array<VersionInfo> = ids.map(id => ({
    id,
    track: 'stable',
    releasedAt: doc.time?.[id],
    latest: id === latestId,
  } satisfies VersionInfo));

  const latestStable = latestId ?? released[0]?.id ?? CURRENT_VERSION_ID;

  return {
    latestStable,
    versions: [currentEntry, ...released],
  };
}

export async function loadVersionCatalog(): Promise<void> {
  _loadError = null;

  const cached = readCache();
  if (cached !== null) {
    _catalog = cached;
    for (const listener of _loadListeners) listener();
    return;
  }

  try {
    const response = await fetch(REGISTRY_URL, {
      // Ask for the abbreviated registry document; smaller payload, same
      // shape for the fields we care about (versions, dist-tags, time).
      headers: { Accept: 'application/vnd.npm.install-v1+json, application/json' },
    });

    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status} ${response.statusText}.`);
    }

    const document = await response.json() as NpmRegistryDocument;
    const catalog = buildCatalog(document);

    _catalog = catalog;
    writeCache(catalog);
  } catch (error) {
    // Fallback: even if the registry call fails, we always have the current
    // entry so the playground is still usable.
    _catalog = {
      latestStable: CURRENT_VERSION_ID,
      versions: [currentEntry],
    };
    _loadError = error instanceof Error ? error.message : String(error);
  }

  for (const listener of _loadListeners) listener();
}
