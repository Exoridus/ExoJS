/**
 * Compile-time vocabulary for versioned document types.
 *
 * A type keeps one tuple of its frozen document interfaces, the version
 * register: the element at index `i` is the body of version `i + 1`, so a
 * version never changes its number. The migration chain is then checked against
 * the register with `satisfies`:
 *
 * ```ts
 * type AtlasVersions = [AtlasDocumentV1, AtlasDocumentV2, AtlasDocumentV3];
 * type AtlasDocument = Latest<AtlasVersions>;
 *
 * export const atlasMigrations = [new AtlasV1ToV2(), new AtlasV2ToV3()] as const satisfies MigrationChain<AtlasVersions>;
 * ```
 *
 * A gap, a duplicate, a wrong order, a skipped version or a step that does not
 * accept the previous step's output is a type error with a readable message.
 * Appending a version to the register breaks the chain until its migration
 * exists. The runtime graph check in `DocumentHistory` covers the same rules
 * for plain JavaScript and for migrations whose `from`/`to` are not literals.
 */

/** What an invalid version register is typed as. The message is the diagnostic. */
export interface VersionRegisterError<Message extends string> {
  readonly versionRegisterError: Message;
}

type Increment<N extends number, Count extends readonly unknown[] = []> = number extends N
  ? number
  : Count['length'] extends N
    ? [...Count, unknown]['length'] & number
    : Increment<N, [...Count, unknown]>;

type RegisterProblem<Versions extends readonly unknown[]> = number extends Versions['length']
  ? 'a version register is a tuple, not an array: its length is the current version'
  : Versions extends readonly []
    ? 'a version register lists at least version 1'
    : [Versions['length']] extends [Required<Versions>['length']]
      ? never
      : 'a version register has no optional elements: every version up to the current one exists';

/** The current schema version of a version register: its length. */
export type CurrentVersion<Versions extends readonly unknown[]> = [RegisterProblem<Versions>] extends [never]
  ? Versions['length']
  : VersionRegisterError<RegisterProblem<Versions>>;

/** The document type of the newest version in a version register. */
export type Latest<Versions extends readonly unknown[]> = [RegisterProblem<Versions>] extends [never]
  ? Versions extends readonly [...unknown[], infer Last]
    ? Last
    : never
  : VersionRegisterError<RegisterProblem<Versions>>;

/**
 * One step of a register's chain, bound to its version numbers and document
 * types. `migrate` is a property so its parameter is checked contravariantly: a
 * migration written for a later document cannot fill an earlier slot.
 */
export interface MigrationStep<From, To, FromVersion extends number, ToVersion extends number> {
  readonly from: FromVersion;
  readonly to: ToVersion;
  readonly migrate: (document: From) => To;
}

type ChainAt<Versions extends readonly unknown[], Version extends number> = Versions extends readonly [
  infer Current,
  infer Next,
  ...infer Rest,
]
  ? readonly [MigrationStep<Current, Next, Version, Increment<Version>>, ...ChainAt<[Next, ...Rest], Increment<Version>>]
  : readonly [];

type ChainFrom<Versions extends readonly unknown[], Min extends number, Index extends number> = Index extends Min
  ? ChainAt<Versions, Index>
  : Versions extends readonly [unknown, ...infer Rest]
    ? ChainFrom<Rest, Min, Increment<Index>>
    : VersionRegisterError<`minVersion ${Min} is not a version of this register`>;

/**
 * The exact migration tuple a version register requires, from `Min` (default:
 * version 1) to the newest version. Pass `Min` when older versions were
 * discontinued: the chain then starts at that version.
 */
export type MigrationChain<Versions extends readonly unknown[], Min extends number = 1> = [RegisterProblem<Versions>] extends [never]
  ? ChainFrom<Versions, Min, 1>
  : VersionRegisterError<RegisterProblem<Versions>>;
