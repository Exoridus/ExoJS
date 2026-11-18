/** Why a document version was refused. */
export type DocumentVersionProblem = 'newer' | 'discontinued' | 'invalid';

export const describeVersion = (value: unknown): string =>
  (typeof value === 'object' && value !== null) || typeof value === 'function' ? typeof value : String(value);

/**
 * Thrown when a {@link DocumentHistory} is built from an inconsistent version
 * graph. Lists every problem at once, and nothing is registered.
 * @advanced
 */
export class DocumentSchemaError extends Error {
  public readonly typeId: string;
  public readonly problems: readonly string[];

  public constructor(typeId: string, problems: readonly string[]) {
    super(`Document type "${typeId}" has an invalid version graph:\n- ${problems.join('\n- ')}`);
    this.name = 'DocumentSchemaError';
    this.typeId = typeId;
    this.problems = problems;
  }
}

/**
 * Thrown when a document's `$version` cannot be read.
 *
 * `reason` is `'newer'` for a document written by a newer application (never
 * read best-effort, because re-saving it would lose data), `'discontinued'`
 * for a version below `minVersion`, and `'invalid'` for a missing or malformed
 * `$version`.
 * @advanced
 */
export class DocumentVersionError extends Error {
  public readonly typeId: string;
  public readonly reason: DocumentVersionProblem;
  public readonly found: unknown;

  public constructor(typeId: string, reason: DocumentVersionProblem, found: unknown, minVersion: number, version: number) {
    const detail = {
      newer: 'was written by a newer version of this type and cannot be read',
      discontinued: 'is older than the oldest version still supported',
      invalid: 'is not a positive integer',
    }[reason];

    super(`Document of type "${typeId}": version ${describeVersion(found)} ${detail} (supported: ${minVersion} to ${version}).`);
    this.name = 'DocumentVersionError';
    this.typeId = typeId;
    this.reason = reason;
    this.found = found;
  }
}

/**
 * Thrown when a {@link Migration} throws. `from` is the version the failing
 * step started at; the migration's own error is the `cause`.
 * @advanced
 */
export class DocumentMigrationError extends Error {
  public readonly typeId: string;
  public readonly from: number;

  public constructor(typeId: string, from: number, cause: unknown) {
    super(`Document of type "${typeId}": the migration from version ${from} to ${from + 1} failed.`, { cause });
    this.name = 'DocumentMigrationError';
    this.typeId = typeId;
    this.from = from;
  }
}
