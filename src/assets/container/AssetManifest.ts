import { AssetDecodeError } from '#assets/AssetDecodeError';

/**
 * Manifest version this build reads. Refused rather than migrated, like a
 * container's: a manifest is build output, so it is rebuilt.
 */
const MANIFEST_VERSION = 1;

/** Length of a SHA-256 digest written as lowercase hex. */
const HASH_HEX_LENGTH = 64;

const HASH_PATTERN = /^[\da-f]+$/;

/** One pack a manifest carries. */
export interface ManifestPack {
  /** Logical name the manifest lists the pack under - stable across re-packs, unlike the file name. */
  readonly name: string;
  /** Where the pack file is, resolved against the manifest's own URL. */
  readonly url: string;
  /**
   * SHA-256 of the whole container file, lowercase hex. The pack's file name
   * carries a prefix of it, which is what makes the URL change exactly when the
   * bytes do, and what lets the file be served with an immutable cache lifetime.
   */
  readonly hash: string;
  readonly byteLength: number;
  readonly blockCount: number;
  /** Logical sources the pack carries, in the order its head lists them. */
  readonly entries: readonly string[];
}

/** How a manifest is fetched. */
export interface AssetManifestOptions {
  /**
   * Forwarded to the request - `signal`, credentials, headers.
   *
   * The manifest is requested with `cache: 'no-cache'` by default, because it
   * is the one URL in a deployment whose contents change; an `init` that names
   * `cache` overrides that.
   */
  readonly init?: RequestInit;
}

type Fail = (detail: string) => never;

const fail: Fail = detail => {
  throw new AssetDecodeError({ message: `Invalid asset manifest: ${detail}.`, assetType: 'manifest' });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isSize = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Where a pack file lives, resolved against the manifest's own URL.
 *
 * The result is an absolute URL wherever a document base exists, so the loader
 * does not resolve it a second time against its base path. A `file` is refused
 * unless it stays under the manifest's directory: a manifest describes the
 * packs deployed beside it, and one that reaches elsewhere is not describing
 * this deployment.
 */
const resolvePackUrl = (manifestUrl: string, name: string, file: unknown): string => {
  if (typeof file !== 'string' || file === '') fail(`pack "${name}" has no "file"`);
  if (file.startsWith('/') || file.includes('\\') || file.includes(':')) fail(`pack "${name}" has a "file" that is not a path beside the manifest`);
  if (file.split('/').includes('..')) fail(`pack "${name}" has a "file" that leaves the manifest directory`);

  const joined = `${manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1)}${file}`;

  try {
    return new URL(joined, typeof location === 'undefined' ? undefined : location.href).href;
  } catch {
    // No document base to resolve against (a bare Node runtime): the joined
    // path is still correct relative to whatever the manifest was fetched from.
    return joined;
  }
};

const readPack = (name: string, value: unknown, manifestUrl: string): ManifestPack => {
  if (!isRecord(value)) fail(`pack "${name}" is not an object`);

  const { hash, byteLength, blockCount, entries } = value;

  if (typeof hash !== 'string' || hash.length !== HASH_HEX_LENGTH || !HASH_PATTERN.test(hash)) {
    fail(`pack "${name}" has no ${HASH_HEX_LENGTH}-character lowercase hex SHA-256 "hash"`);
  }
  if (!isSize(byteLength)) fail(`pack "${name}" has an invalid "byteLength"`);
  if (!isSize(blockCount)) fail(`pack "${name}" has an invalid "blockCount"`);
  if (!Array.isArray(entries) || entries.some(entry => typeof entry !== 'string')) fail(`pack "${name}" has no "entries" array of sources`);

  return { name, url: resolvePackUrl(manifestUrl, name, value.file), hash, byteLength, blockCount, entries: entries as string[] };
};

/**
 * The packs a deployment holds, addressed by logical name.
 *
 * A pack file is named after the hash of its own bytes, so its URL changes
 * exactly when its contents do and it can be cached forever. The manifest is
 * the one URL that has to be re-read: it says which file currently holds each
 * logical pack, and describes each one - byte length, block count, the sources
 * it carries - well enough to decide what to load before loading anything.
 *
 * Reading a pack through a manifest is what makes a re-packed asset set cheap
 * for a returning client. Blocks are stored by hash, so the blocks that did not
 * change are re-used from a {@link ContainerBlockStore} and only the changed
 * ones are fetched.
 *
 * @example
 * ```ts
 * const manifest = await loader.loadManifest('assets.json');
 * const level = await loader.loadContainer(manifest.pack('level1'), { store: cacheApiBlockStore() });
 * ```
 */
export class AssetManifest {
  private constructor(
    /** The URL this manifest was read from; every pack file is addressed relative to it. */
    public readonly url: string,
    private readonly _packs: ReadonlyMap<string, ManifestPack>,
  ) {}

  /**
   * Fetch and validate the manifest at `url`.
   *
   * Prefer `loader.loadManifest`, which resolves `url` against the loader's
   * base path and carries the application's request options. This is the same
   * thing for a caller that has neither.
   *
   * Throws when the manifest cannot be fetched, is not JSON, states a version
   * this build does not read, or describes a pack it cannot address.
   */
  public static async open(url: string, options: AssetManifestOptions = {}): Promise<AssetManifest> {
    const response = await fetch(url, { cache: 'no-cache', ...options.init });

    if (!response.ok) {
      fail(`"${url}" could not be fetched (HTTP ${response.status})`);
    }

    let document: unknown;

    try {
      document = await response.json();
    } catch (error: unknown) {
      throw new AssetDecodeError({ message: `Invalid asset manifest: "${url}" is not valid JSON.`, assetType: 'manifest', cause: error });
    }

    return AssetManifest.parse(document, url);
  }

  /**
   * Validate a manifest document that arrived some other way - inlined by a
   * bundler, or read from a store - as if it had been fetched from `url`.
   *
   * `url` is what pack files are addressed against, so it has to be the URL the
   * manifest is deployed at even when nothing fetched it.
   */
  public static parse(document: unknown, url: string): AssetManifest {
    if (!isRecord(document)) fail(`"${url}" is not a JSON object`);
    if (document.version !== MANIFEST_VERSION) {
      fail(
        `"${url}" states version ${JSON.stringify(document.version)}, and this build reads version ${MANIFEST_VERSION} - rebuild it with \`exo assets pack\``,
      );
    }
    if (!isRecord(document.packs)) fail(`"${url}" has no "packs" object`);

    const packs = new Map<string, ManifestPack>();

    for (const [name, value] of Object.entries(document.packs)) {
      packs.set(name, readPack(name, value, url));
    }

    return new AssetManifest(url, packs);
  }

  /** Every pack the manifest carries, in the order it lists them. */
  public get packs(): readonly ManifestPack[] {
    return [...this._packs.values()];
  }

  /** Whether the manifest carries a pack under this name. */
  public has(name: string): boolean {
    return this._packs.has(name);
  }

  /**
   * The pack under `name`.
   *
   * Throws when the manifest does not carry one, naming the packs it does: a
   * name that is not there is a mistake in the call, not something a caller can
   * recover from at runtime.
   */
  public pack(name: string): ManifestPack {
    const pack = this._packs.get(name);

    if (pack === undefined) {
      throw new Error(`AssetManifest: "${this.url}" carries no pack "${name}". It carries: ${[...this._packs.keys()].join(', ')}.`);
    }

    return pack;
  }

  /**
   * The pack carrying `source`, or `undefined` when no pack does.
   *
   * `source` is the logical path the entry was packed under - the same string a
   * network load would use. This answers from the manifest alone, so nothing is
   * fetched to find out where an asset lives.
   */
  public packFor(source: string): ManifestPack | undefined {
    for (const pack of this._packs.values()) {
      if (pack.entries.includes(source)) return pack;
    }

    return undefined;
  }
}
