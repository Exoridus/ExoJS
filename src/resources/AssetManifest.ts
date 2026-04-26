import type { Loadable } from './Loader';

export interface AssetEntry<T extends Loadable = Loadable> {
    readonly type: T;
    readonly alias: string;
    readonly path: string;
    readonly options?: unknown;
}

export interface AssetManifest {
    readonly bundles: Readonly<Record<string, ReadonlyArray<AssetEntry>>>;
}

export interface LoadBundleOptions {
    background?: boolean;
    onProgress?: (loaded: number, total: number) => void;
}

export class BundleLoadError extends Error {

    public readonly bundle: string;
    public readonly failures: Array<{
        type: Loadable;
        alias: string;
        error: Error;
    }>;

    public constructor(
        bundle: string,
        failures: Array<{
            type: Loadable;
            alias: string;
            error: Error;
        }>,
    ) {
        super(`Failed to load bundle "${bundle}" (${failures.length} failure${failures.length === 1 ? '' : 's'}).`);

        this.name = 'BundleLoadError';
        this.bundle = bundle;
        this.failures = failures;
    }
}

export function defineAssetManifest<const M extends AssetManifest>(manifest: M): M {
    validateAssetManifest(manifest);

    return manifest;
}

function validateAssetManifest(manifest: AssetManifest): void {
    if (!isObjectRecord(manifest)) {
        throw new Error('Invalid asset manifest: manifest must be an object.');
    }

    if (!isObjectRecord(manifest.bundles)) {
        throw new Error('Invalid asset manifest: manifest.bundles must be an object.');
    }

    for (const [bundleName, rawEntries] of Object.entries(manifest.bundles)) {
        if (bundleName.trim().length === 0) {
            throw new Error('Invalid asset manifest: bundle names must be non-empty strings.');
        }

        if (!Array.isArray(rawEntries)) {
            throw new Error(`Invalid asset manifest: bundle "${bundleName}" must be an array of entries.`);
        }

        const seenAliasesByType = new Map<Loadable, Set<string>>();

        rawEntries.forEach((rawEntry, index) => {
            const location = `bundle "${bundleName}" entry[${index}]`;

            if (!isObjectRecord(rawEntry)) {
                throw new Error(`Invalid asset manifest: ${location} must be an object.`);
            }

            if (typeof rawEntry.type !== 'function') {
                throw new Error(`Invalid asset manifest: ${location} has an invalid "type" token.`);
            }

            assertNonEmptyString(rawEntry.alias, `${location} has an invalid "alias".`);
            assertNonEmptyString(rawEntry.path, `${location} has an invalid "path".`);

            const type = rawEntry.type as Loadable;
            const alias = rawEntry.alias as string;

            if (!seenAliasesByType.has(type)) {
                seenAliasesByType.set(type, new Set());
            }

            const aliases = seenAliasesByType.get(type)!;

            if (aliases.has(alias)) {
                throw new Error(
                    `Invalid asset manifest: duplicate (${describeType(type)}, "${alias}") in bundle "${bundleName}".`,
                );
            }

            aliases.add(alias);
        });
    }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function assertNonEmptyString(value: unknown, message: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Invalid asset manifest: ${message}`);
    }
}

function describeType(type: Loadable): string {
    return type.name.length > 0 ? type.name : '(anonymous type)';
}
