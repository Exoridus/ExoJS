import { getPlaygroundNavigation } from './curation-catalog';
import { resolveExampleAlias } from './example-aliases';
import { PLAYGROUND_CATEGORY_BY_SLUG } from './playground-categories';
import { PRESERVED_EXAMPLES } from './preserved-examples';
import { createUniqueRequest } from './request-manager';
import type { Example, ExampleDefinition, ExamplesMap, ExamplesResponse } from './types';
import { buildExampleUrl, buildGithubRawExampleUrl } from './url-builder';
import { isCurrentVersion } from './versions';

// Per-version cache. The store keeps an internal map keyed by version id so
// switching back to a previously-loaded version is instant and so concurrent
// in-flight loads for different versions don't stomp on each other. The
// "current" id loads from the locally-deployed examples; everything else
// loads from raw.githubusercontent.com at the matching tag.

interface VersionEntry {
  response: ExamplesResponse | null;
  error: string | null;
  pending?: Promise<void>;
}

const _entries = new Map<string, VersionEntry>();
const _loadListeners = new Set<(versionId: string) => void>();

const getOrCreateEntry = (versionId: string): VersionEntry => {
  let entry = _entries.get(versionId);

  if (!entry) {
    entry = { response: null, error: null };
    _entries.set(versionId, entry);
  }

  return entry;
};

const buildSourceUrl = (versionId: string, filePath: string): string => {
  if (isCurrentVersion(versionId)) {
    return buildExampleUrl(filePath, { 'no-cache': Date.now() });
  }

  // Remote release sources are immutable - let the browser/CDN cache normally.
  return buildGithubRawExampleUrl(versionId, filePath);
};

export const hasExamplesFor = (versionId: string): boolean => {
  const response = _entries.get(versionId)?.response;

  return response !== undefined && response !== null;
};

export const getLoadErrorFor = (versionId: string): string | null => _entries.get(versionId)?.error ?? null;

export const onExamplesLoaded = (callback: (versionId: string) => void): (() => void) => {
  _loadListeners.add(callback);

  return () => _loadListeners.delete(callback);
};

const getCleanName = (text: string): string =>
  text
    .split('-')
    .map((part: string) => ([...part].some(char => char !== char.toUpperCase()) ? part[0].toUpperCase() + part.substring(1) : part))
    .join(' ');

export const getNestedExamples = (versionId: string): ExamplesMap => {
  const response = _entries.get(versionId)?.response;

  if (!response) {
    return new Map();
  }

  if (isCurrentVersion(versionId)) {
    return getPlaygroundNavigation();
  }

  return new Map(
    Object.entries(response)
      .sort(([a], [b]) => {
        const orderA = PLAYGROUND_CATEGORY_BY_SLUG.get(a)?.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = PLAYGROUND_CATEGORY_BY_SLUG.get(b)?.order ?? Number.MAX_SAFE_INTEGER;

        return orderA - orderB || a.localeCompare(b);
      })
      .map(([directory, definitions]) => [
        getCleanName(directory),
        definitions
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((def: ExampleDefinition) => ({ ...def, section: directory })),
      ]),
  );
};

export const getExamplesList = (versionId: string): Array<Example> => Array.from(getNestedExamples(versionId).values()).flat();

export const getExampleByPath = (versionId: string, path: string): Example | null => {
  const resolvedPath = isCurrentVersion(versionId) ? resolveExampleAlias(path) : path;

  const example = getExamplesList(versionId).find(entry => entry.path === resolvedPath);

  if (example) {
    return example;
  }

  if (isCurrentVersion(versionId)) {
    const response = _entries.get(versionId)?.response;

    for (const [section, definitions] of Object.entries(response ?? {})) {
      const retained = definitions.find(entry => entry.path === resolvedPath);

      if (retained) {
        return { ...retained, section };
      }
    }
  }

  const preserved = isCurrentVersion(versionId) ? PRESERVED_EXAMPLES.find(entry => entry.path === resolvedPath) : undefined;

  return preserved ? { ...preserved, backend: 'core', section: 'guide-fixtures' } : null;
};

export const loadExampleSource = async (versionId: string, filePath: string): Promise<string> =>
  createUniqueRequest(buildSourceUrl(versionId, filePath)).getText();

export const loadExamples = (versionId: string): Promise<void> => {
  const entry = getOrCreateEntry(versionId);

  if (entry.pending) {
    return entry.pending;
  }

  entry.error = null;
  const url = buildSourceUrl(versionId, 'examples.json');
  const pending = (async (): Promise<void> => {
    try {
      const data = await createUniqueRequest(url).getJson<ExamplesResponse>();

      if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.values(data).every(Array.isArray)) {
        throw new Error(`Invalid examples catalog at ${url}.`);
      }

      entry.response = data;
      entry.error = null;
    } catch (error) {
      entry.response = null;
      entry.error = error instanceof Error ? error.message : String(error);
    } finally {
      entry.pending = undefined;

      for (const listener of _loadListeners) {
        listener(versionId);
      }
    }
  })();
  entry.pending = pending;

  return pending;
};
