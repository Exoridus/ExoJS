// Source-of-truth for the version dropdown. Reads released versions from
// the GitHub Releases API; the "current" entry is a virtual id for whatever
// HEAD-of-main the playground was built from. Released versions load their
// example sources from raw.githubusercontent.com and their library bundle
// from jsDelivr — see example-store.ts and preview.html for the loader sides.

const RELEASES_URL = 'https://api.github.com/repos/Exoridus/ExoJS/releases?per_page=30';
const CACHE_KEY = 'exojs-version-catalog-v1';
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

interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
  published_at: string | null;
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

function tagToId(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

function summarize(body: string | null, fallback: string | null): string | undefined {
  const source = (body && body.trim().length > 0 ? body : fallback) ?? '';
  const firstLine = source.split('\n').find(line => line.trim().length > 0) ?? '';
  const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^[*-]\s+/, '').trim();
  if (!cleaned) return undefined;
  return cleaned.length > 80 ? cleaned.slice(0, 77) + '…' : cleaned;
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

function buildCatalog(releases: ReadonlyArray<GithubRelease>): VersionCatalog {
  const released: Array<VersionInfo> = releases
    .filter(release => !release.draft)
    .map(release => ({
      id: tagToId(release.tag_name),
      track: release.prerelease ? 'beta' : 'stable',
      releasedAt: release.published_at ?? undefined,
      summary: summarize(release.body, release.name),
    } satisfies VersionInfo));

  const latestStableEntry = released.find(version => version.track === 'stable');
  const latestStable = latestStableEntry?.id ?? released[0]?.id ?? CURRENT_VERSION_ID;

  if (latestStableEntry) {
    latestStableEntry.latest = true;
  }

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
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      throw new Error(`GitHub Releases API returned ${response.status} ${response.statusText}.`);
    }

    const releases = await response.json() as Array<GithubRelease>;
    const catalog = buildCatalog(releases);

    _catalog = catalog;
    writeCache(catalog);
  } catch (error) {
    // Fallback: even if the API call fails, we always have the current entry
    // so the playground is still usable.
    _catalog = {
      latestStable: CURRENT_VERSION_ID,
      versions: [currentEntry],
    };
    _loadError = error instanceof Error ? error.message : String(error);
  }

  for (const listener of _loadListeners) listener();
}
