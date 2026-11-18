import { describeDocumentValue, DocumentMigrationError, DocumentSchemaError, DocumentVersionError } from './documentErrors';
import type { DocumentParser } from './DocumentParser';
import type { Migration } from './Migration';

/**
 * A persisted document: the body's own fields plus the framework-owned `$type`
 * and `$version`, side by side. There is no `data` envelope.
 */
export type VersionedDocument<Body extends object = object> = Readonly<Body> & {
  readonly $type: string;
  readonly $version: number;
};

/** Construction options for {@link DocumentHistory}. */
export interface DocumentHistoryOptions<Document extends object> {
  /** Stable type id, written to `$type`. Never derived from a class name. */
  readonly id: string;
  /** Current schema version, a positive integer. Defaults to 1. */
  readonly version?: number;
  /** Oldest version still read; older documents are refused by name. Defaults to 1. */
  readonly minVersion?: number;
  /** One migration per version from `minVersion` up to, but excluding, `version`. */
  readonly migrations?: ReadonlyArray<Migration<never, unknown>>;
  /** Validates the body at the current version, after all migrations. */
  readonly parser: DocumentParser<Document>;
}

const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const inspectVersionGraph = (options: Pick<DocumentHistoryOptions<object>, 'version' | 'minVersion' | 'migrations'>): string[] => {
  const { version = 1, minVersion = 1, migrations = [] } = options;
  const problems: string[] = [];

  if (!isVersion(version)) {
    problems.push(`version must be a positive integer, got ${describeDocumentValue(version)}`);
  }

  if (!isVersion(minVersion)) {
    problems.push(`minVersion must be a positive integer, got ${describeDocumentValue(minVersion)}`);
  }

  if (problems.length > 0) {
    return problems;
  }

  if (minVersion > version) {
    return [`minVersion ${minVersion} is newer than version ${version}`];
  }

  const seen = new Set<number>();

  for (const migration of migrations) {
    if ((typeof migration !== 'object' || migration === null) && typeof migration !== 'function') {
      problems.push('Migration: an entry must be an object');
      continue;
    }

    const { from, to } = migration;
    const prototype = Reflect.getPrototypeOf(migration);
    const constructor: unknown = prototype === null ? undefined : Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
    const label: unknown = typeof constructor === 'function' ? Object.getOwnPropertyDescriptor(constructor, 'name')?.value : undefined;
    const name = typeof label === 'string' ? label : 'Migration';

    if (typeof migration.migrate !== 'function') {
      problems.push(`${name}: has no migrate() method`);
    }

    if (!isVersion(from) || !isVersion(to)) {
      problems.push(`${name}: from/to must be positive integers, got ${describeDocumentValue(from)}->${describeDocumentValue(to)}`);
      continue;
    }

    if (to !== from + 1) {
      problems.push(`${name}: a migration advances exactly one version, got ${from}->${to}`);
    }

    if (seen.has(from)) {
      problems.push(`${name}: a second migration from version ${from}`);
    }

    seen.add(from);

    if (from < minVersion) {
      problems.push(`${name}: migrates from version ${from}, which is older than minVersion ${minVersion}`);
    } else if (from >= version) {
      problems.push(`${name}: migrates from version ${from}, which is not older than version ${version}`);
    }
  }

  if (problems.length === 0 && seen.size === version - minVersion) {
    return problems;
  }

  let missingFrom = minVersion;

  const reportMissing = (until: number): void => {
    if (until === missingFrom + 1) {
      problems.push(`no migration from version ${missingFrom} to ${until}`);
    } else if (until > missingFrom) {
      problems.push(`missing migrations from version ${missingFrom} through ${until - 1}`);
    }
  };

  // A broken graph can span many versions without containing a single step.
  for (const from of [...seen].sort((left, right) => left - right)) {
    if (from >= minVersion && from < version) {
      reportMissing(from);
      missingFrom = from + 1;
    }
  }

  reportMissing(version);

  return problems;
};

/**
 * The schema history of one persisted document type: its version range, its
 * migrations and the upgrade path through them.
 *
 * The version graph is checked on construction and every problem is reported
 * at once (see {@link DocumentSchemaError}). Reading never interprets a newer
 * or a discontinued version; see {@link DocumentVersionError}.
 *
 * @typeParam Document - the body type at the current version.
 *
 * @example
 * ```ts
 * const history = new DocumentHistory<AtlasDocument>({
 *   id: 'atlas',
 *   version: 3,
 *   migrations: [new AtlasV1ToV2(), new AtlasV2ToV3()],
 *   parser: new AtlasParser(),
 * });
 *
 * const document = history.read(JSON.parse(text));
 * const persisted = history.frame(document); // { $type: 'atlas', $version: 3, ...document }
 * ```
 * @advanced
 */
export class DocumentHistory<Document extends object> {
  public readonly id: string;
  public readonly version: number;
  public readonly minVersion: number;

  private readonly _steps = new Map<number, Migration<never, unknown>>();
  private readonly _parser: DocumentParser<Document>;

  public constructor(options: DocumentHistoryOptions<Document>) {
    const problems = inspectVersionGraph(options);

    if (problems.length > 0) {
      throw new DocumentSchemaError(options.id, problems);
    }

    this.id = options.id;
    this.version = options.version ?? 1;
    this.minVersion = options.minVersion ?? 1;
    this._parser = options.parser;

    for (const migration of options.migrations ?? []) {
      this._steps.set(migration.from, migration);
    }
  }

  /**
   * Reads a persisted document: checks `$type` and `$version`, runs the
   * migrations from that version, then validates the result with the parser.
   *
   * @throws {@link DocumentVersionError} for a missing, newer or discontinued version; a `TypeError` for
   * a foreign `$type`; {@link DocumentMigrationError} when a migration throws.
   */
  public read(input: unknown): Document {
    if (!isRecord(input)) {
      throw new TypeError(`Document of type "${this.id}": expected an object.`);
    }

    const { $type, $version, ...body } = input;

    if ($type !== this.id) {
      throw new TypeError(`Expected a document of type "${this.id}", got ${JSON.stringify($type)}.`);
    }

    return this.upgrade($version, body);
  }

  /**
   * Upgrades a body written at `version` to the current version and validates it.
   * The checks of {@link read} apply, without the `$type` check.
   */
  public upgrade(version: unknown, body: unknown): Document {
    if (!isVersion(version)) {
      throw new DocumentVersionError(this.id, 'invalid', version, this.minVersion, this.version);
    }

    if (version > this.version) {
      throw new DocumentVersionError(this.id, 'newer', version, this.minVersion, this.version);
    }

    if (version < this.minVersion) {
      throw new DocumentVersionError(this.id, 'discontinued', version, this.minVersion, this.version);
    }

    let current = body;

    for (let from = version; from < this.version; from++) {
      try {
        current = (this._steps.get(from) as Migration<unknown, unknown>).migrate(current);
      } catch (error) {
        throw new DocumentMigrationError(this.id, from, error);
      }
    }

    return this._parser.parse(current);
  }

  /**
   * Frames a current body for persistence: `$type` and `$version` first, then
   * the body's own fields. Writing always produces the current version.
   *
   * @throws if the body itself uses `$type` or `$version`.
   */
  public frame(document: Document): VersionedDocument<Document> {
    if ('$type' in document || '$version' in document) {
      throw new TypeError(`Document of type "${this.id}": "$type" and "$version" are reserved and cannot be body fields.`);
    }

    return { $type: this.id, $version: this.version, ...document };
  }
}
