import { buildExampleUrl } from './url-builder';
import { createUniqueRequest } from './request-manager';

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

let _catalog: VersionCatalog | null = null;
let _loadError: string | null = null;

const _loadListeners = new Set<() => void>();

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

export function getVersionLoadError(): string | null {
  return _loadError;
}

export function onVersionsLoaded(callback: () => void): () => void {
  _loadListeners.add(callback);
  return () => _loadListeners.delete(callback);
}

export async function loadVersionCatalog(): Promise<void> {
  const url = buildExampleUrl('versions.json', { 'no-cache': Date.now() });
  _loadError = null;

  try {
    const request = createUniqueRequest(url);
    const data = await request.getJson<VersionCatalog>();

    if (data === null) {
      throw new Error(`Could not load the versions catalog from ${url}.`);
    }

    _catalog = data;
    _loadError = null;
  } catch (error) {
    _catalog = null;
    _loadError = error instanceof Error ? error.message : String(error);
  }

  for (const listener of _loadListeners) {
    listener();
  }
}
