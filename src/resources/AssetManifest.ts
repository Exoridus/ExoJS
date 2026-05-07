import type { Loadable } from './Loader';

/**
 * A single asset declaration inside an {@link AssetManifest} bundle.
 *
 * `type` is the loadable class token (e.g. `Texture`, `Sound`), `alias` is
 * the key used to retrieve the asset from the {@link Loader}, and `path` is
 * the URL or relative path used to fetch it.
 */
export interface AssetEntry<T extends Loadable = Loadable> {
    readonly type: T;
    readonly alias: string;
    readonly path: string;
    readonly options?: unknown;
}

/**
 * Static description of all asset bundles in an application.
 *
 * Pass to {@link Loader.registerManifest} and then load individual bundles on
 * demand with {@link Loader.loadBundle}. Use {@link defineAssetManifest} to
 * construct a validated, type-safe manifest at authoring time.
 */
export interface AssetManifest {
    readonly bundles: Readonly<Record<string, ReadonlyArray<AssetEntry>>>;
}

/**
 * Options controlling how a bundle is loaded by {@link Loader.loadBundle}.
 *
 * Set `background` to `true` to load the bundle through the low-priority
 * background queue, and supply `onProgress` for per-bundle progress updates.
 */
export interface LoadBundleOptions {
    background?: boolean;
    onProgress?: (loaded: number, total: number) => void;
}

/**
 * Thrown by {@link Loader.loadBundle} when one or more assets in the bundle
 * fail to load.
 *
 * The `failures` array contains every entry that errored, letting callers
 * distinguish individual per-asset failures from a wholesale network outage.
 */
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

/**
 * Validates and returns a strongly-typed {@link AssetManifest}.
 *
 * Validates the manifest shape at runtime (non-empty bundle names, valid entry
 * fields, no duplicate aliases per type/bundle) and preserves the literal
 * types of the input for downstream type inference. Throws a descriptive
 * `Error` on any validation failure.
 *
 * @example
 * ```ts
 * const manifest = defineAssetManifest({
 *   bundles: {
 *     ui: [{ type: Texture, alias: 'button', path: 'assets/button.png' }],
 *   },
 * });
 * loader.registerManifest(manifest);
 * ```
 */
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
