/**
 * Checks that every path pattern in the ESLint config still matches a file.
 *
 * A flat-config block is scoped by `files`, and a rule relaxed inside such a
 * block applies only while some file matches it. Rename or move that file and
 * the block silently stops applying: the relaxation is gone, and whichever rule
 * it was holding back comes back on a file nobody touched. Nothing in ESLint,
 * TypeScript or the test suite notices, because the pattern is a string that
 * happens to look like a path.
 *
 * This has bitten this repository three times in one cleanup - a `no-console`
 * exemption, a `require-await` exemption, and an ignore entry - each time
 * reported as a failure in the file that moved rather than in the config that
 * named it.
 *
 * The check is deliberately one-directional. A pattern matching nothing is
 * always a defect: either the file it named is gone, or the pattern never
 * worked. A pattern matching something proves only that the block is live, not
 * that the relaxation inside it is still needed - that question needs
 * `pnpm lint:overrides:audit`, which measures it.
 *
 * `ignores` patterns are exempt: they legitimately describe paths that may not
 * exist in a given checkout (build output, vendored trees, transient fixtures).
 */
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

import config from '../eslint.config.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');

/**
 * Patterns that intentionally match nothing in a clean checkout, each with the
 * reason. An entry is a claim that the pattern names something generated.
 */
const ALLOWED: readonly { readonly pattern: string; readonly reason: string }[] = [
  {
    pattern: '**/*.mts',
    reason: 'names a module kind the repository has none of yet; the rules should apply the day the first one appears',
  },
  {
    pattern: '**/*.cts',
    reason: 'names a module kind the repository has none of yet; the rules should apply the day the first one appears',
  },
  {
    pattern: 'scripts/**/*.mjs',
    reason: 'every script is TypeScript today, but a plain ESM script would still need this block',
  },
];

if (ALLOWED.some(entry => entry.reason.trim() === '')) {
  throw new Error('check-eslint-config-paths: every allowlist entry needs a reason.');
}

const isAllowed = (pattern: string): boolean => ALLOWED.some(entry => entry.pattern === pattern);

/** Every `files` pattern in the config, flattened; a block may nest arrays to express AND. */
const collectPatterns = (): string[] => {
  const patterns = new Set<string>();

  for (const block of config as readonly { files?: unknown }[]) {
    const files = block.files;

    if (files === undefined) continue;

    for (const entry of Array.isArray(files) ? files : [files]) {
      if (typeof entry === 'string') {
        patterns.add(entry);
      } else if (Array.isArray(entry)) {
        for (const nested of entry as unknown[]) {
          if (typeof nested === 'string') patterns.add(nested);
        }
      }
    }
  }

  return [...patterns].sort();
};

const matchesSomething = async (pattern: string): Promise<boolean> => {
  // A negated pattern constrains an existing set rather than naming files of
  // its own, so its own match count says nothing.
  if (pattern.startsWith('!')) return true;

  for await (const _match of glob(pattern, { cwd: REPO_ROOT })) return true;

  return false;
};

const main = async (): Promise<void> => {
  const patterns = collectPatterns();

  console.log(`Checking ${patterns.length} ESLint path pattern(s) against the tree...\n`);

  const dead = (await Promise.all(patterns.map(async pattern => ((await matchesSomething(pattern)) || isAllowed(pattern) ? null : pattern)))).filter(
    (pattern): pattern is string => pattern !== null,
  );

  if (dead.length > 0) {
    console.error(`\x1b[31m${dead.length} ESLint path pattern(s) match no file:\x1b[0m`);

    for (const pattern of dead) {
      console.error(`  ${pattern}`);
    }

    console.error('\nA files pattern that matches nothing scopes its rules to nothing - the file it named has moved, or the pattern never worked.');
    process.exit(1);
  }

  console.log(`\x1b[32m${patterns.length} pattern(s) checked, every one matches at least one file.\x1b[0m`);
};

await main();
