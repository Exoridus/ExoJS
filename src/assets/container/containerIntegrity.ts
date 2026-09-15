import { AssetDecodeError } from '#assets/AssetDecodeError';

import type { ManifestPack } from './AssetManifest';

type Fail = (detail: string) => never;

const fail: Fail = detail => {
  throw new AssetDecodeError({ message: `Invalid asset container: ${detail}.`, assetType: 'container' });
};

const toHex = (digest: ArrayBuffer): string => [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * Check a pack's length against what its manifest record states.
 *
 * The only check the block-wise path can make: a reader that fetches blocks by
 * range never holds the whole file, so there is nothing to hash. What guards
 * that path is the content-addressed URL, which names bytes rather than a
 * location.
 */
export const verifyPackLength = (pack: ManifestPack, byteLength: number): void => {
  if (byteLength !== pack.byteLength) {
    fail(`pack "${pack.name}" is ${byteLength} bytes, but the manifest states ${pack.byteLength}`);
  }
};

/**
 * Check a pack's bytes against its manifest record: the length, then the digest.
 *
 * Where `crypto.subtle` is unavailable - an insecure context - the digest is
 * skipped and the length still checked, rather than failing a load over a
 * capability the page does not have.
 */
export const verifyPackBytes = async (pack: ManifestPack, buffer: ArrayBuffer): Promise<void> => {
  verifyPackLength(pack, buffer.byteLength);

  // Absent in an insecure context, where the type says otherwise.
  const subtle = typeof crypto === 'undefined' ? undefined : (crypto.subtle as SubtleCrypto | undefined);

  if (subtle === undefined) return;

  const hash = toHex(await subtle.digest('SHA-256', buffer));

  if (hash !== pack.hash) {
    fail(`pack "${pack.name}" has hash ${hash}, but the manifest states ${pack.hash}`);
  }
};
