const jsModules = import.meta.glob<string>('~examples/**/*.js', { query: '?raw', import: 'default', eager: true });
const tsModules = import.meta.glob<string>('~examples/**/*.ts', { query: '?raw', import: 'default', eager: true });

const normalizeToCatalogPath = (key: string): string => {
  const normalized = key.split('\\').join('/');
  const marker = '/examples/';
  const idx = normalized.lastIndexOf(marker);
  if (idx === -1) {
    return normalized.split('/').slice(-2).join('/');
  }
  return normalized.slice(idx + marker.length);
};

// Execution source: always JavaScript (runs in browser module scripts).
const EXEC_SOURCE_BY_PATH = new Map<string, string>();

// Display source: TypeScript if available, otherwise JavaScript.
const DISPLAY_SOURCE_BY_PATH = new Map<string, string>();

/**
 * Source as the playground and guide code blocks show it.
 *
 * Guide snippet markers (`// #region guide:name` / `// #endregion ...`) are
 * authoring metadata for `source-snippets.ts`, not part of the example, so they
 * are dropped together with the blank line they would leave behind. Import
 * declarations that Prettier wrapped one specifier per line are joined back
 * onto one line: the wrapped form is right for a diff and wrong for a first
 * look at an example, where the import list is noise above the code.
 */
export const presentExampleSource = (source: string): string => {
  const withoutMarkers = source.replace(/^[ \t]*\/\/ #(?:region|endregion)\b[^\n]*\n(?:[ \t]*\n)?/gmu, '');

  return withoutMarkers.replace(/^(import(?: type)? \{)\n([\s\S]*?)\n\} from (['"][^'"]+['"];)$/gmu, (_match, head: string, body: string, tail: string) => {
    const specifiers = body
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join(' ')
      .replace(/,\s*$/u, '');

    return `${head} ${specifiers} } from ${tail}`;
  });
};

for (const [key, sourceCode] of Object.entries(jsModules)) {
  const catalogPath = normalizeToCatalogPath(key);
  EXEC_SOURCE_BY_PATH.set(catalogPath, sourceCode);
  DISPLAY_SOURCE_BY_PATH.set(catalogPath, presentExampleSource(sourceCode));
}

for (const [key, sourceCode] of Object.entries(tsModules)) {
  if (key.endsWith('.d.ts')) continue;
  // TS sources are keyed by the equivalent .js catalog path.
  const catalogPath = normalizeToCatalogPath(key).replace(/\.ts$/, '.js');
  DISPLAY_SOURCE_BY_PATH.set(catalogPath, presentExampleSource(sourceCode));
}

// Returns the display source for an example: TypeScript when available (for
// code blocks in guide pages), otherwise the JavaScript source.
export const getExampleSource = (chapter: string, slug: string): string =>
  DISPLAY_SOURCE_BY_PATH.get(`${chapter}/${slug}.js`) ?? `// Missing source: ${chapter}/${slug}.js`;

// Returns the execution source for an example: always JavaScript so it can be
// injected directly as a browser module script (used by guide preview embeds
// and the smoke harness).
export const getExampleExecutionSource = (chapter: string, slug: string): string =>
  EXEC_SOURCE_BY_PATH.get(`${chapter}/${slug}.js`) ?? DISPLAY_SOURCE_BY_PATH.get(`${chapter}/${slug}.js`) ?? `// Missing source: ${chapter}/${slug}.js`;
