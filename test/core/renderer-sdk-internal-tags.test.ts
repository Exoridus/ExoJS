/**
 * Every symbol the renderer-sdk barrel re-exports must survive into the
 * shipped declarations.
 *
 * The declaration build strips anything tagged `@internal`, but the barrel's
 * re-export line stays: a consumer of `@codexo/exojs/renderer-sdk` then gets a
 * declaration file that names a member its source module no longer exports,
 * and every program that includes the subpath fails to type-check. Nothing
 * else in the repository sees this - the in-repo type-check resolves the
 * sources, where the tag is a comment - so the source is checked directly.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const barrel = readFileSync(resolve(root, 'src/renderer-sdk.ts'), 'utf8');

/** Each `export [type] { a, b as c } from '#path'` of the barrel as [names, source file]. */
const reExports = (): Array<[string[], string]> =>
  [...barrel.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'#([^']+)'/g)].map(match => {
    const names = match[1]
      .split(',')
      .map(
        entry =>
          entry
            .trim()
            .split(/\s+as\s+/)[0]
            ?.trim() ?? '',
      )
      .filter(name => name.length > 0 && !name.startsWith('type '));
    return [names, resolve(root, 'src', `${match[2]}.ts`)];
  });

/** The JSDoc block directly above the export declaring `name`, or `null` when there is none. */
const docOf = (source: string, name: string): string | null => {
  // A block must not run across an earlier comment's `*/`, or a private
  // member's tag further up the file would be read as the export's.
  const pattern = new RegExp(
    `(/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/)\\s*export\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:interface|type|class|const|function|enum)\\s+${name}\\b`,
  );
  const match = pattern.exec(source);

  return match?.[1] ?? null;
};

describe('renderer-sdk barrel', () => {
  test('re-exports nothing the declaration build strips as internal', () => {
    const stripped: string[] = [];

    for (const [names, file] of reExports()) {
      const source = readFileSync(file, 'utf8');

      for (const name of names) {
        const doc = docOf(source, name);

        if (doc !== null && /@internal\b/.test(doc)) {
          stripped.push(`${name} (${file.slice(root.length + 1)})`);
        }
      }
    }

    expect(stripped).toStrictEqual([]);
  });
});
