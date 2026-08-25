/**
 * Gate: the full-bundle IIFE entry must not silently omit a package's public
 * value exports.
 *
 * `scripts/exo-full.entry.ts` re-exports some packages with `export *` and
 * others through a hand-written named list, because tiled and ldtk re-export
 * tilemap's runtime classes and those must appear exactly once in the bundle.
 * A hand-written list drifts: a helper added to a package stays out of
 * `window.Exo` forever, and nothing fails.
 *
 * The rule this enforces: a package's public value export may be missing from
 * the entry only when the very same binding is already in the bundle from an
 * earlier package, or when it is listed below with a reason. Type-only exports
 * are out of scope - an IIFE global carries no types.
 *
 * A package the entry re-exports with `export *` cannot drift and is only read
 * here to record which bindings the bundle already carries. The gate therefore
 * has teeth exactly where the risk is: the hand-written lists.
 *
 * The comparison runs against the built `dist/esm` barrels, so `pnpm build`
 * must have produced them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const ENTRY = join(ROOT, 'scripts', 'exo-full.entry.ts');

/**
 * Public value exports deliberately kept out of the full bundle, with the
 * reason. Anything not listed here and not re-exported is a gate failure.
 */
const INTENTIONAL_OMISSIONS: Readonly<Record<string, string>> = {};

interface EntryBlock {
  readonly specifier: string;
  /** `null` for `export *`, which covers everything the package exports. */
  readonly names: readonly string[] | null;
}

/** Parse the entry's re-export blocks in source order. */
const parseEntry = (source: string): EntryBlock[] => {
  const blocks: EntryBlock[] = [];
  const star = /^export \* from '([^']+)';$/gm;
  const named = /^export \{([^}]*)\} from '([^']+)';$/gms;

  for (const match of source.matchAll(star)) {
    blocks.push({ specifier: match[1]!, names: null, index: match.index } as EntryBlock & { index: number });
  }

  for (const match of source.matchAll(named)) {
    const names = match[1]!
      .split(',')
      .map(name =>
        name
          .trim()
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .filter(name => name.length > 0);

    blocks.push({ specifier: match[2]!, names, index: match.index } as EntryBlock & { index: number });
  }

  return blocks.sort((a, b) => (a as EntryBlock & { index: number }).index - (b as EntryBlock & { index: number }).index);
};

/** Absolute path of a workspace package's built ESM barrel, or `null`. */
const barrelPath = (specifier: string): string | null => {
  const directory = specifier === '@codexo/exojs' ? ROOT : join(ROOT, 'packages', specifier.replace('@codexo/', ''));
  const barrel = join(directory, 'dist', 'esm', 'index.js');

  return existsSync(barrel) ? barrel : null;
};

const blocks = parseEntry(readFileSync(ENTRY, 'utf8'));
const missingBuilds: string[] = [];
const failures: string[] = [];
/** Every binding already reachable from the bundle, by identity. */
const bundled = new Set<unknown>();

for (const block of blocks) {
  const barrel = barrelPath(block.specifier);

  if (barrel === null) {
    missingBuilds.push(block.specifier);
    continue;
  }

  const module = (await import(pathToFileURL(barrel).href)) as Record<string, unknown>;
  const exported = Object.keys(module).filter(name => name !== 'default');

  if (block.names === null) {
    for (const name of exported) bundled.add(module[name]);
    continue;
  }

  const listed = new Set(block.names);

  for (const name of exported) {
    const value = module[name];

    if (listed.has(name)) {
      bundled.add(value);
      continue;
    }

    // A binding already in the bundle under the same identity is a deliberate
    // de-duplication, not an omission: tiled and ldtk re-export tilemap's
    // runtime classes, and the bundle must carry each of those exactly once.
    if (bundled.has(value)) continue;

    if (Object.hasOwn(INTENTIONAL_OMISSIONS, name)) continue;

    failures.push(`${block.specifier}: '${name}' is a public value export but the full-bundle entry omits it`);
  }

  for (const name of block.names) {
    if (!exported.includes(name) && !Object.hasOwn(module, name)) {
      failures.push(`${block.specifier}: entry re-exports '${name}', which the package does not export`);
    }
  }
}

if (missingBuilds.length > 0) {
  console.error(`check-full-bundle-exports: no built barrel for ${missingBuilds.join(', ')}. Run \`pnpm build\` first.`);
  process.exit(2);
}

if (failures.length > 0) {
  console.error('Full-bundle entry is out of sync with the packages it bundles:\n');

  for (const failure of failures) console.error(`  - ${failure}`);

  console.error(
    `\nAdd each symbol to scripts/exo-full.entry.ts, or record it in INTENTIONAL_OMISSIONS ` +
      `in scripts/check-full-bundle-exports.ts with the reason it stays out.`,
  );
  process.exit(1);
}

console.log(`Full-bundle entry covers every public value export of ${blocks.length} bundled package(s).`);
