import { createHash } from 'node:crypto';

/**
 * The integrity cover a published profile document carries.
 *
 * The hash is taken over a canonical rendering of the document with its own
 * `signature` field removed, so the same document always hashes to the same
 * value regardless of key order or formatting, and any edit to any other field
 * changes it. Reading a file, dropping its signature and hashing the rest is
 * therefore the whole verification.
 *
 * This is an integrity mechanism, not an authenticity one. It cannot prove who
 * ran the harness - the recipe is public. What it does prove is that the
 * numbers, the provenance and the verdicts in one file were produced together
 * by one harness run and have not been edited since, which is exactly what a
 * hand-written result file fails.
 */

/** Hash algorithm the signature value is produced with. */
export const PROFILE_SIGNATURE_ALGORITHM = 'sha256';

/**
 * Domain separator mixed into every digest.
 *
 * Without it the value is the hash of an arbitrary JSON document, and a digest
 * computed for some unrelated purpose over the same bytes would be accepted
 * here. The version suffix moves with the canonicalization rules, so changing
 * how documents are hashed invalidates old signatures instead of silently
 * accepting them.
 */
const SIGNATURE_DOMAIN = 'exojs-bench-profile/v1';

/** The field the digest is written into, and the one field it is never taken over. */
const SIGNATURE_FIELD = 'signature';

/**
 * Render a value with object keys in a fixed order so serialization is a pure
 * function of content. `undefined` properties are dropped, matching what
 * `JSON.stringify` writes, so a document round-tripped through a file hashes
 * identically to the one that was written.
 */
const byKey = ([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined);
  const canonical: Record<string, unknown> = {};

  for (const [key, entry] of entries.sort(byKey)) {
    canonical[key] = canonicalize(entry);
  }

  return canonical;
};

/**
 * Digest of a profile document. The document's own `signature` field, if
 * present, is excluded, so this returns the same value for a document about to
 * be signed and for the signed file it was written to.
 */
export const computeProfileSignature = (document: unknown): string => {
  const fields = typeof document === 'object' && document !== null ? (document as Record<string, unknown>) : {};
  const covered = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== SIGNATURE_FIELD));

  return createHash(PROFILE_SIGNATURE_ALGORITHM)
    .update(`${SIGNATURE_DOMAIN}\n${JSON.stringify(canonicalize(covered))}`)
    .digest('hex');
};
