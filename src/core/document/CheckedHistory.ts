import type { VersionRegisterError } from './documentVersions';
import type { Migration } from './Migration';

type AnyMigration = Migration<never, unknown>;
type InputOf<M> = M extends Migration<infer Input, unknown> ? Input : never;
type OutputOf<M> = M extends Migration<never, infer Output> ? Output : never;
type CountTo<N extends number, Count extends readonly unknown[] = []> = Count['length'] extends N
  ? Count
  : Count['length'] extends 128
    ? never
    : CountTo<N, [...Count, unknown]>;
type Increment<N extends number> = [CountTo<N>] extends [never] ? number : [...CountTo<N>, unknown]['length'];
type HasOrderedVersions<Version extends number, Min extends number> = [CountTo<Version>] extends [never]
  ? true
  : [CountTo<Min>] extends [never]
    ? false
    : CountTo<Version> extends readonly [...CountTo<Min>, ...unknown[]]
      ? true
      : false;
type IsPositiveInteger<N extends number> = `${N}` extends `${bigint}` ? (`${N}` extends `-${string}` | '0' ? false : true) : false;

type CheckStep<Step extends AnyMigration, Expected extends number, Previous> = [Previous] extends [InputOf<Step>]
  ? number extends Step['from'] | Step['to'] | Expected
    ? Step
    : Step['from'] extends Expected
      ? Step['to'] extends Increment<Expected>
        ? Step
        : VersionRegisterError<`a migration advances exactly one version, found ${Step['from']}->${Step['to']}`>
      : VersionRegisterError<`expected the migration from version ${Expected}, found ${Step['from']}`>
  : VersionRegisterError<`migration ${Step['from']}->${Step['to']} does not accept the previous migration's output`>;

type CheckEnd<Step extends AnyMigration, Version extends number, Document> = number extends Step['to']
  ? Step
  : Step['to'] extends Version
    ? [OutputOf<Step>] extends [Document]
      ? [Document] extends [OutputOf<Step>]
        ? Step
        : VersionRegisterError<'the last migration does not produce the current document type'>
      : VersionRegisterError<'the last migration does not produce the current document type'>
    : VersionRegisterError<`the chain ends at version ${Step['to']}, the registered version is ${Version}`>;

type CheckChain<
  Chain extends readonly AnyMigration[],
  Expected extends number,
  Previous,
  Version extends number,
  Document,
> = Chain extends readonly [infer Step extends AnyMigration, ...infer Rest extends readonly AnyMigration[]]
  ? Rest extends readonly []
    ? readonly [CheckStep<Step, Expected, Previous> extends Step ? CheckEnd<Step, Version, Document> : CheckStep<Step, Expected, Previous>]
    : readonly [CheckStep<Step, Expected, Previous>, ...CheckChain<Rest, Step['to'], OutputOf<Step>, Version, Document>]
  : Chain;

/**
 * Checks a registration's literal version bounds, adjacent migration inputs
 * and outputs, and the final document type. Runtime history validates widened
 * versions and migration arrays, and handles numeric comparisons between
 * versions above 128 to avoid TypeScript's recursion limit.
 */
export type CheckedHistory<Document, Version extends number, Min extends number, Chain extends readonly AnyMigration[]> = number extends
  | Version
  | Min
  ? { readonly migrations?: Chain }
  : IsPositiveInteger<Version> extends false
    ? { readonly version: VersionRegisterError<`version must be a positive integer, found ${Version}`> }
    : IsPositiveInteger<Min> extends false
      ? { readonly minVersion: VersionRegisterError<`minVersion must be a positive integer, found ${Min}`> }
      : HasOrderedVersions<Version, Min> extends true
        ? [Version] extends [Min]
          ? { readonly migrations?: readonly [] }
          : {
              readonly migrations: Chain extends readonly []
                ? VersionRegisterError<`version ${Version} needs the migrations from version ${Min}`>
                : CheckChain<Chain, Min, never, Version, Document>;
            }
        : { readonly minVersion: VersionRegisterError<`minVersion ${Min} is newer than version ${Version}`> };
