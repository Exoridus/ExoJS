import { readFileSync } from 'node:fs';

import { describe, expect, test, vi } from 'vitest';

import { DocumentMigrationError, DocumentSchemaError, DocumentVersionError } from '#core/document/documentErrors';
import { DocumentHistory } from '#core/document/DocumentHistory';
import type { Migration } from '#core/document/Migration';

import {
  type AtlasDocument,
  atlasHistoryAt,
  atlasMigrations,
  AtlasParser,
  AtlasV1ToV2,
  AtlasV2ToV3,
} from '../../assets/atlas-document-pilot';

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`test/fixtures/documents/${name}.json`, 'utf8')) as Record<string, unknown>;

const current = (): DocumentHistory<AtlasDocument> => atlasHistoryAt(3);

const { $type: _type, $version: _version, ...atlasV3Body } = fixture('atlas-v3');

const catchError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error('expected the call to throw');
};

describe('DocumentHistory.read', () => {
  test.each(['atlas-v1', 'atlas-v2', 'atlas-v3'])('reads the frozen %s fixture as the current document', name => {
    expect(current().read(fixture(name))).toEqual(atlasV3Body);
  });

  test('hands migrations and the parser the body without the frame', () => {
    const seen: unknown[] = [];
    const history = new DocumentHistory<object>({
      id: 'atlas',
      version: 2,
      migrations: [{ from: 1, to: 2, migrate: (body: unknown) => (seen.push(body), { migrated: true }) }],
      parser: { parse: input => (seen.push(input), input as object) },
    });

    history.read({ $type: 'atlas', $version: 1, image: 'a.png' });

    expect(seen).toEqual([{ image: 'a.png' }, { migrated: true }]);
  });

  test('does not run a migration for a document that is already current', () => {
    const migrate = vi.fn((body: unknown) => body);
    const history = new DocumentHistory<object>({
      id: 'atlas',
      version: 2,
      migrations: [{ from: 1, to: 2, migrate }],
      parser: { parse: input => input as object },
    });

    history.read({ $type: 'atlas', $version: 2 });

    expect(migrate).not.toHaveBeenCalled();
  });

  test('refuses a newer version by name, before any migration runs', () => {
    const migrate = vi.fn((body: unknown) => body);
    const history = new DocumentHistory<object>({
      id: 'atlas',
      version: 2,
      migrations: [{ from: 1, to: 2, migrate }],
      parser: { parse: input => input as object },
    });

    const error = catchError(() => history.read({ $type: 'atlas', $version: 3 }));

    expect(error).toBeInstanceOf(DocumentVersionError);
    expect(error).toMatchObject({ typeId: 'atlas', reason: 'newer', found: 3 });
    expect(migrate).not.toHaveBeenCalled();
  });

  test('refuses a discontinued version by name and still reads the oldest supported one', () => {
    const history = new DocumentHistory<AtlasDocument>({
      id: 'atlas',
      version: 3,
      minVersion: 2,
      migrations: [new AtlasV2ToV3()],
      parser: new AtlasParser(),
    });

    const error = catchError(() => history.read(fixture('atlas-v1')));

    expect(error).toMatchObject({ reason: 'discontinued', found: 1 });
    expect((error as Error).message).toContain('supported: 2 to 3');
    expect(history.read(fixture('atlas-v2'))).toEqual(atlasV3Body);
  });

  test.each([undefined, 0, -1, 1.5, '2', Number.NaN, null])('refuses $version %s as invalid', version => {
    const error = catchError(() => current().read({ $type: 'atlas', $version: version }));

    expect(error).toMatchObject({ reason: 'invalid' });
  });

  test('refuses a foreign $type and a non-object input', () => {
    expect(() => current().read({ $type: 'sprite', $version: 3 })).toThrow(TypeError);
    expect(() => current().read({ $version: 3 })).toThrow(/got undefined/);

    for (const input of [null, undefined, [], 'atlas', 3]) {
      expect(() => current().read(input)).toThrow(TypeError);
    }
  });

  test('names the failing step and keeps the migration error as the cause', () => {
    const boom = new Error('bad data');
    const history = new DocumentHistory<object>({
      id: 'atlas',
      version: 2,
      migrations: [
        {
          from: 1,
          to: 2,
          migrate: () => {
            throw boom;
          },
        },
      ],
      parser: { parse: input => input as object },
    });

    const error = catchError(() => history.read({ $type: 'atlas', $version: 1 }));

    expect(error).toBeInstanceOf(DocumentMigrationError);
    expect(error).toMatchObject({ typeId: 'atlas', from: 1, cause: boom });
  });

  test('validates a migrated document with the current parser, whatever its age', () => {
    const broken = { ...fixture('atlas-v2'), frames: [{ name: 'a', page: 0, x: 0, y: 0, width: 'wide', height: 1 }] };

    expect(() => current().read(broken)).toThrow(/frames\[0\]\.width must be a finite number/);
  });

  test('never mutates its input, and migrating twice gives the same result', () => {
    const input = fixture('atlas-v1');
    const snapshot = structuredClone(input);

    const first = current().read(input);

    expect(input).toEqual(snapshot);
    expect(current().read(input)).toEqual(first);
  });

  test('a migration that mutates nested input fails on deep-frozen data', () => {
    const deepFreeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }

      return value;
    };

    const mutating: Migration<{ nested: { value: number } }, object> = {
      from: 1,
      to: 2,
      migrate: document => {
        document.nested.value = 2;

        return document;
      },
    };
    const history = new DocumentHistory<object>({
      id: 'atlas',
      version: 2,
      migrations: [mutating],
      parser: { parse: input => input as object },
    });

    const error = catchError(() => history.read(deepFreeze({ $type: 'atlas', $version: 1, nested: { value: 1 } })));

    expect(error).toBeInstanceOf(DocumentMigrationError);
  });

  test('keeps a "__proto__" key from a parsed document as plain data', () => {
    const history = new DocumentHistory<object>({ id: 'atlas', parser: { parse: input => input as object } });
    const document = history.read(JSON.parse('{"$type":"atlas","$version":1,"__proto__":{"polluted":true}}'));

    expect(Object.hasOwn(document, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(document)).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('DocumentHistory.frame', () => {
  test('writes the current version flat, with the frame keys first and no data envelope', () => {
    const framed = current().frame(atlasV3Body as unknown as AtlasDocument);

    expect(Object.keys(framed)).toEqual(['$type', '$version', 'density', 'pages', 'frames']);
    expect(framed).toEqual(fixture('atlas-v3'));
  });

  test('round-trips through JSON', () => {
    const history = current();
    const document = history.read(fixture('atlas-v1'));

    expect(history.read(JSON.parse(JSON.stringify(history.frame(document))))).toEqual(document);
  });

  test('refuses a body that uses a reserved key', () => {
    const history = new DocumentHistory<object>({ id: 'atlas', parser: { parse: input => input as object } });

    expect(() => history.frame({ $version: 9 })).toThrow(/reserved/);
    expect(() => history.frame({ $type: 'x' })).toThrow(/reserved/);
  });
});

describe('DocumentHistory construction', () => {
  const noParser = { parse: (input: unknown) => input as object };

  const problemsOf = (options: ConstructorParameters<typeof DocumentHistory<object>>[0]): readonly string[] => {
    const error = catchError(() => new DocumentHistory(options));

    expect(error).toBeInstanceOf(DocumentSchemaError);

    return (error as DocumentSchemaError).problems;
  };

  const step = (from: number, to: number): Migration<never, unknown> => ({ from, to, migrate: () => ({}) });

  test('accepts a complete chain, a discontinued range and an unversioned type', () => {
    expect(() => new DocumentHistory({ id: 'a', version: 3, migrations: atlasMigrations, parser: noParser })).not.toThrow();
    expect(
      () => new DocumentHistory({ id: 'a', version: 3, minVersion: 2, migrations: [new AtlasV2ToV3()], parser: noParser }),
    ).not.toThrow();
    expect(() => new DocumentHistory({ id: 'a', parser: noParser })).not.toThrow();
  });

  test('reports every problem of a broken graph at once and registers nothing', () => {
    const problems = problemsOf({
      id: 'a',
      version: 5,
      migrations: [new AtlasV1ToV2(), new AtlasV1ToV2(), step(3, 5)],
      parser: noParser,
    });

    expect(problems).toEqual([
      'AtlasV1ToV2: a second migration from version 1',
      'Object: a migration advances exactly one version, got 3->5',
      'no migration from version 2 to 3',
      'no migration from version 4 to 5',
    ]);
  });

  test('rejects a missing chain, a skipped version, a dead step and a step from the future', () => {
    expect(problemsOf({ id: 'a', version: 2, parser: noParser })).toEqual(['no migration from version 1 to 2']);
    expect(problemsOf({ id: 'a', version: 3, migrations: [step(1, 3)], parser: noParser })).toContain(
      'Object: a migration advances exactly one version, got 1->3',
    );
    expect(problemsOf({ id: 'a', version: 3, minVersion: 2, migrations: atlasMigrations, parser: noParser })).toEqual([
      'AtlasV1ToV2: migrates from version 1, which is older than minVersion 2',
    ]);
    expect(problemsOf({ id: 'a', version: 2, migrations: [step(1, 2), step(2, 3)], parser: noParser })).toEqual([
      'Object: migrates from version 2, which is not older than version 2',
    ]);
  });

  test('rejects non-integer versions and a minVersion above version', () => {
    expect(problemsOf({ id: 'a', version: 0, parser: noParser })).toEqual(['version must be a positive integer, got 0']);
    expect(problemsOf({ id: 'a', version: 1.5, minVersion: -1, parser: noParser })).toHaveLength(2);
    expect(problemsOf({ id: 'a', version: 2, minVersion: 3, parser: noParser })).toEqual(['minVersion 3 is newer than version 2']);
  });

  test('rejects migrations without literal integer bounds or without a migrate method', () => {
    const wide = { from: 1.5, to: 2.5, migrate: () => ({}) };
    const hollow = { from: 1, to: 2 } as unknown as Migration<never, unknown>;

    expect(problemsOf({ id: 'a', version: 2, migrations: [wide], parser: noParser })[0]).toContain('from/to must be positive integers');
    expect(problemsOf({ id: 'a', version: 2, migrations: [hollow], parser: noParser })).toEqual(['Object: has no migrate() method']);
  });
});
