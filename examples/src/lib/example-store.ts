import type { Example, ExampleDefinition, ExamplesMap, ExamplesResponse } from './types';
import { buildVersionedExampleUrl } from './url-builder';
import { createUniqueRequest } from './request-manager';

// Phase 2: the example catalog is per-version. The store keeps an internal
// cache keyed by version id so switching back to a previously-loaded version
// is instant and so concurrent in-flight loads for different versions don't
// stomp on each other.

interface VersionEntry {
  response: ExamplesResponse | null;
  error: string | null;
}

const _entries = new Map<string, VersionEntry>();
const _loadListeners = new Set<(versionId: string) => void>();

function getOrCreateEntry(versionId: string): VersionEntry {
  let entry = _entries.get(versionId);
  if (!entry) {
    entry = { response: null, error: null };
    _entries.set(versionId, entry);
  }
  return entry;
}

export function hasExamplesFor(versionId: string): boolean {
  return _entries.get(versionId)?.response != null;
}

export function getLoadErrorFor(versionId: string): string | null {
  return _entries.get(versionId)?.error ?? null;
}

export function onExamplesLoaded(callback: (versionId: string) => void): () => void {
  _loadListeners.add(callback);
  return () => _loadListeners.delete(callback);
}

function getCleanName(text: string): string {
  return text
    .split('-')
    .map((part: string) =>
      [...part].some(char => char !== char.toUpperCase())
        ? part[0].toUpperCase() + part.substring(1)
        : part
    )
    .join(' ');
}

export function getNestedExamples(versionId: string): ExamplesMap {
  const response = _entries.get(versionId)?.response;
  if (!response) {
    return new Map();
  }

  return new Map(
    Object.entries(response).map(([directory, definitions]) => [
      getCleanName(directory),
      definitions
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((def: ExampleDefinition) => ({ ...def, section: directory })),
    ])
  );
}

export function getExamplesList(versionId: string): Array<Example> {
  return Array.from(getNestedExamples(versionId).values()).flat();
}

export function getAvailableTags(versionId: string): Array<string> {
  return Array.from(
    new Set(getExamplesList(versionId).flatMap(example => example.tags ?? []))
  ).sort((a, b) => a.localeCompare(b));
}

export function getExampleByPath(versionId: string, path: string): Example | null {
  return getExamplesList(versionId).find(example => example.path === path) ?? null;
}

export async function loadExampleSource(versionId: string, filePath: string): Promise<string> {
  const url = buildVersionedExampleUrl(versionId, filePath, { 'no-cache': Date.now() });
  const request = createUniqueRequest(url);
  const response = await request.getText();

  if (response === null) {
    throw new Error(`Could not fetch example source at ${url}!`);
  }

  return response;
}

export async function loadExamples(versionId: string): Promise<void> {
  const entry = getOrCreateEntry(versionId);
  entry.error = null;

  const url = buildVersionedExampleUrl(versionId, 'examples.json', { 'no-cache': Date.now() });

  try {
    const request = createUniqueRequest(url);
    const data = await request.getJson<ExamplesResponse>();

    if (data === null) {
      throw new Error(`Could not load the examples catalog from ${url}.`);
    }

    entry.response = data;
    entry.error = null;
  } catch (error) {
    entry.response = null;
    entry.error = error instanceof Error ? error.message : String(error);
  }

  for (const listener of _loadListeners) {
    listener(versionId);
  }
}
