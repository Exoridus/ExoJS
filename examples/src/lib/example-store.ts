import type { Example, ExampleDefinition, ExamplesMap, ExamplesResponse } from './types';
import { buildExampleUrl } from './url-builder';
import { createUniqueRequest } from './request-manager';

let _examplesResponse: ExamplesResponse | null = null;
let _loadError: string | null = null;

const _loadListeners = new Set<() => void>();

export function getLoadError(): string | null {
  return _loadError;
}

export function hasExamples(): boolean {
  return _examplesResponse !== null;
}

export function onExamplesLoaded(callback: () => void): () => void {
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

export function getNestedExamples(): ExamplesMap {
  if (!_examplesResponse) {
    return new Map();
  }

  return new Map(
    Object.entries(_examplesResponse).map(([directory, definitions]) => [
      getCleanName(directory),
      definitions
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((def: ExampleDefinition) => ({ ...def, section: directory })),
    ])
  );
}

export function getFilteredExamples(tagFilter: string | null): ExamplesMap {
  const nested = getNestedExamples();

  if (!tagFilter) {
    return nested;
  }

  const filtered = Array.from(nested.entries())
    .map(([section, examples]) => [
      section,
      examples.filter(example => (example.tags ?? []).includes(tagFilter)),
    ] as [string, Array<Example>])
    .filter(([, examples]) => examples.length > 0);

  return new Map(filtered);
}

export function getExamplesList(): Array<Example> {
  return Array.from(getNestedExamples().values()).flat();
}

export function getAvailableTags(): Array<string> {
  return Array.from(
    new Set(getExamplesList().flatMap(example => example.tags ?? []))
  ).sort((a, b) => a.localeCompare(b));
}

export function getExampleByPath(path: string): Example | null {
  return getExamplesList().find(example => example.path === path) ?? null;
}

export async function loadExampleSource(filePath: string): Promise<string> {
  const url = buildExampleUrl(filePath, { 'no-cache': Date.now() });
  const request = createUniqueRequest(url);
  const response = await request.getText();

  if (response === null) {
    throw new Error(`Could not fetch example source at ${url}!`);
  }

  return response;
}

export async function loadExamples(): Promise<void> {
  const url = buildExampleUrl('examples.json', { 'no-cache': Date.now() });
  _loadError = null;

  try {
    const request = createUniqueRequest(url);
    const data = await request.getJson<ExamplesResponse>();

    if (data === null) {
      throw new Error(`Could not load the examples catalog from ${url}.`);
    }

    _examplesResponse = data;
    _loadError = null;
  } catch (error) {
    _examplesResponse = null;
    _loadError = error instanceof Error ? error.message : String(error);
  }

  for (const listener of _loadListeners) {
    listener();
  }
}
