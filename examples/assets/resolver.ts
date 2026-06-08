export function createAssetUrl(path: string, baseUrl: string = '/assets/'): string {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    return `${normalizedBase}${normalizedPath}`;
}

export function resolveAssetCatalog<T extends Record<string, unknown>>(catalog: T, baseUrl: string = '/assets/'): { [K in keyof T]: T[K] extends string ? string : T[K] extends Record<string, unknown> ? ReturnType<typeof resolveAssetCatalog<T[K]>> : T[K] } {
    const resolved = {} as Record<string, unknown>;

    for (const [key, value] of Object.entries(catalog)) {
        if (typeof value === 'string') {
            resolved[key] = createAssetUrl(value, baseUrl);
        } else if (value && typeof value === 'object') {
            resolved[key] = resolveAssetCatalog(value as Record<string, unknown>, baseUrl);
        } else {
            resolved[key] = value;
        }
    }

    return resolved as ReturnType<typeof resolveAssetCatalog<T>>;
}
