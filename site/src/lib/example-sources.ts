const modules = import.meta.glob<string>('~examples/**/*.js', { query: '?raw', import: 'default', eager: true });

const normalizeToCatalogPath = (key: string): string => {
    const normalized = key.split('\\').join('/');
    const marker = '/examples/';
    const idx = normalized.lastIndexOf(marker);
    if (idx === -1) {
        return normalized.split('/').slice(-2).join('/');
    }
    return normalized.slice(idx + marker.length);
};

const SOURCE_BY_PATH = new Map<string, string>();

for (const [key, sourceCode] of Object.entries(modules)) {
    SOURCE_BY_PATH.set(normalizeToCatalogPath(key), sourceCode);
}

export const getExampleSource = (chapter: string, slug: string): string => SOURCE_BY_PATH.get(`${chapter}/${slug}.js`) ?? `// Missing source: ${chapter}/${slug}.js`;
