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

for (const [key, sourceCode] of Object.entries(jsModules)) {
    const catalogPath = normalizeToCatalogPath(key);
    EXEC_SOURCE_BY_PATH.set(catalogPath, sourceCode);
    DISPLAY_SOURCE_BY_PATH.set(catalogPath, sourceCode);
}

for (const [key, sourceCode] of Object.entries(tsModules)) {
    if (key.endsWith('.d.ts')) continue;
    // TS sources are keyed by the equivalent .js catalog path.
    const catalogPath = normalizeToCatalogPath(key).replace(/\.ts$/, '.js');
    DISPLAY_SOURCE_BY_PATH.set(catalogPath, sourceCode);
}

// Returns the display source for an example: TypeScript when available (for
// code blocks in guide pages), otherwise the JavaScript source.
export const getExampleSource = (chapter: string, slug: string): string =>
    DISPLAY_SOURCE_BY_PATH.get(`${chapter}/${slug}.js`) ?? `// Missing source: ${chapter}/${slug}.js`;

// Returns the execution source for an example: always JavaScript so it can be
// injected directly as a browser module script (used by guide preview embeds
// and the smoke harness).
export const getExampleExecutionSource = (chapter: string, slug: string): string =>
    EXEC_SOURCE_BY_PATH.get(`${chapter}/${slug}.js`) ??
    DISPLAY_SOURCE_BY_PATH.get(`${chapter}/${slug}.js`) ??
    `// Missing source: ${chapter}/${slug}.js`;
