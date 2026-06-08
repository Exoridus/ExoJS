// Auto-generated from resolver.ts — edit the .ts source, not this file.
export function createAssetUrl(path, baseUrl = '/assets/') {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    return `${normalizedBase}${normalizedPath}`;
}
export function resolveAssetCatalog(catalog, baseUrl = '/assets/') {
    const resolved = {};
    for (const [key, value] of Object.entries(catalog)) {
        if (typeof value === 'string') {
            resolved[key] = createAssetUrl(value, baseUrl);
        }
        else if (value && typeof value === 'object') {
            resolved[key] = resolveAssetCatalog(value, baseUrl);
        }
        else {
            resolved[key] = value;
        }
    }
    return resolved;
}
