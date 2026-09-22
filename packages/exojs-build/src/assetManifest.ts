import { createHash } from 'node:crypto';

import { CONTAINER_HEADER_SIZE, CONTAINER_MAGIC, CONTAINER_VERSION, type ContainerHead } from './assetContainer.js';

/**
 * Asset manifest for `.exoa` packs - the document that names packs by content.
 *
 * A pack file is named after the hash of its own bytes, so its URL changes
 * exactly when its bytes do and it can be served with an immutable cache
 * lifetime. The manifest is then the one mutable URL in a deployment: it maps a
 * logical pack name to the file that currently holds it, and states enough
 * about each pack - byte length, block count, the entries it carries - for an
 * application to decide what to fetch before fetching anything.
 *
 * The reader is `AssetManifest` in `@codexo/exojs`. Neither package may depend
 * on the other, so both state the document shape and the round-trip specs are
 * what keeps them equal.
 */

/**
 * Manifest document version written by {@link mergeAssetManifest}.
 *
 * Independent of the container format version: the manifest describes packs, it
 * does not frame their bytes. A reader refuses a version it does not know
 * rather than migrating it, because a manifest is build output.
 */
export const ASSET_MANIFEST_VERSION = 1;

/**
 * Hex characters of the pack hash that go into its file name.
 *
 * Sixteen are 64 bits, which keeps a collision out of reach for any realistic
 * number of packs while leaving the name readable in a directory listing. The
 * full digest stays in the manifest, and that is what a client verifies
 * against, so the short name costs nothing in integrity.
 */
const PACK_NAME_HASH_LENGTH = 16;

/** What a container says about itself once it is written, before it is placed in a manifest. */
export interface ContainerPackDescription {
  /** SHA-256 of the whole container file, lowercase hex. */
  readonly hash: string;
  readonly byteLength: number;
  readonly blockCount: number;
  /** Logical sources the pack carries, in the order the head lists them. */
  readonly entries: readonly string[];
}

/** One pack in a manifest: where it is now, and what it holds. */
export interface AssetManifestPack extends ContainerPackDescription {
  /** Path to the pack file, relative to the manifest's own directory and always forward-slashed. */
  readonly file: string;
}

/** The manifest document itself, as it is written to disk. */
export interface AssetManifestDocument {
  readonly version: number;
  /** Packs by logical name. A map rather than a list, so a duplicate name cannot be expressed. */
  readonly packs: Readonly<Record<string, AssetManifestPack>>;
}

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The file name a pack is written under: `<name>.<hash prefix>.exoa`.
 *
 * `hash` is the full digest {@link describeContainerPack} reports; the name
 * carries only its prefix.
 */
export const containerPackFileName = (name: string, hash: string): string => `${name}.${hash.slice(0, PACK_NAME_HASH_LENGTH)}.exoa`;

/**
 * Read back what a manifest record needs from container bytes that were just
 * written: their digest, their length, how many blocks they hold and which
 * sources those blocks cover.
 *
 * @throws Error when `container` is not a container this build writes, which
 * can only mean the caller passed something else.
 */
export const describeContainerPack = (container: ArrayBuffer): ContainerPackDescription => {
  const bytes = new Uint8Array(container);
  const view = new DataView(container);

  if (container.byteLength < CONTAINER_HEADER_SIZE || new TextDecoder().decode(bytes.subarray(0, 4)) !== CONTAINER_MAGIC) {
    throw new Error('describeContainerPack: the buffer does not start with an .exoa container header');
  }

  const version = view.getUint32(4, true);

  if (version !== CONTAINER_VERSION) {
    throw new Error(`describeContainerPack: container version ${version} was not written by this build (version ${CONTAINER_VERSION})`);
  }

  const headEnd = CONTAINER_HEADER_SIZE + view.getUint32(12, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(CONTAINER_HEADER_SIZE, headEnd))) as ContainerHead;

  return {
    hash: sha256Hex(bytes),
    byteLength: container.byteLength,
    blockCount: head.blocks.length,
    entries: head.entries.map(entry => entry.source),
  };
};

/**
 * Names a manifest cannot express in stable order.
 *
 * A JSON object puts integer-like keys first and in numeric order whatever
 * order they were written in, so a manifest holding one would not round-trip
 * the order this function sorts into, and two builds could produce different
 * bytes for the same packs.
 */
const INTEGER_LIKE = /^\d+$/;

/**
 * Put `pack` into `existing` under `name`, or start a manifest when there is
 * none.
 *
 * Every other record is preserved, so packing each pack in its own invocation
 * builds one manifest. Records are written in name order, which keeps the
 * document diff-stable regardless of the order the packs were built in.
 *
 * @param existing The parsed contents of a manifest already on disk, or `undefined` to start one.
 * @throws Error when `existing` is not a manifest, states a version this build does not write, or
 * carries a record that is not an object; and when `name` is one a JSON object would reorder.
 */
export const mergeAssetManifest = (existing: unknown, name: string, pack: AssetManifestPack): AssetManifestDocument => {
  if (name === '' || INTEGER_LIKE.test(name)) {
    throw new Error(`pack name ${JSON.stringify(name)} cannot be written in a stable order; name it with something other than digits alone`);
  }

  // A Map, not an object literal: a pack named `__proto__` assigned onto `{}`
  // would reach the prototype setter instead of becoming an entry.
  const packs = new Map<string, AssetManifestPack>();

  if (existing !== undefined) {
    if (!isRecord(existing) || !isRecord(existing.packs)) {
      throw new Error('the file is not an asset manifest');
    }

    if (existing.version !== ASSET_MANIFEST_VERSION) {
      throw new Error(`manifest version ${JSON.stringify(existing.version)} is not the version this build writes (${ASSET_MANIFEST_VERSION})`);
    }

    for (const [key, value] of Object.entries(existing.packs)) {
      if (!isRecord(value)) {
        throw new Error(`the record for pack ${JSON.stringify(key)} is not an object`);
      }

      packs.set(key, value as unknown as AssetManifestPack);
    }
  }

  packs.set(name, pack);

  return {
    version: ASSET_MANIFEST_VERSION,
    packs: Object.fromEntries([...packs].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
};
