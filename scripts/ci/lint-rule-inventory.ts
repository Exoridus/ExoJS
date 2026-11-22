/**
 * Records resolved ESLint rules for tracked files in one real lint context.
 * Run the root and site scopes in separate processes: plugins can resolve their
 * optional dependencies from process.cwd(), not just ESLint's cwd option.
 * This is inspection tooling; it never rewrites a lint configuration.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { ESLint, type Linter, type Rule } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';

import { LINT_PASSES } from '../lint.ts';

interface RuleVariant {
  options: Linter.RuleEntry;
  files: string[];
}

interface RuleInventory {
  id: string;
  plugin: string;
  name: string;
  type: Rule.RuleMetaData['type'];
  docs: Rule.RuleMetaData['docs'];
  requiresTypeChecking: boolean;
  variants: RuleVariant[];
  files: string[];
}

interface ConfigGroup {
  rules: Record<string, Linter.RuleEntry>;
  linterOptions: Linter.LinterOptions | undefined;
  parserOptions: unknown;
  files: string[];
}

const { values } = parseArgs({
  options: {
    scope: { type: 'string' },
    output: { type: 'string' },
  },
  strict: true,
});

if ((values.scope !== 'root' && values.scope !== 'site') || !values.output) {
  throw new Error('Usage: node scripts/ci/lint-rule-inventory.ts --scope <root|site> --output <path.json>');
}

const output = resolve(values.output);
const root = resolve(import.meta.dirname, '../..');
const cwd = values.scope === 'site' ? resolve(root, 'site') : root;

process.chdir(cwd);

const git = (...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });
const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean));
const selected =
  values.scope === 'site'
    ? [...tracked].filter(file => /\.(?:[cm]?[jt]sx?|astro)$/u.test(file))
    : LINT_PASSES.flatMap(pass => globSync(pass.globs, { cwd }));
const paths = [...new Set(selected)].filter(file => tracked.has(file)).toSorted();
const eslint = new ESLint({ cwd });
const rules = new Map<string, RuleInventory>();
const groups = new Map<string, ConfigGroup>();
const ignored: string[] = [];

// React's typed preset identifies these rules even where rule metadata omits
// requiresTypeChecking. Keep this explicit until that metadata is complete.
const typedReactRules = new Set([
  'no-implicit-children',
  'no-implicit-key',
  'no-implicit-ref',
  'no-leaked-conditional-rendering',
  'no-unused-props',
]);
const serialize = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => (item instanceof RegExp ? { regexp: item.source, flags: item.flags } : item));

const enabled = (value: Linter.RuleEntry | undefined): value is Linter.RuleEntry => {
  const severity = Array.isArray(value) ? value[0] : value;

  return severity !== undefined && severity !== 0 && severity !== 'off';
};

for (const localFile of paths) {
  const file = values.scope === 'site' ? `site/${localFile}` : localFile;
  const config = (await eslint.calculateConfigForFile(resolve(localFile))) as Linter.Config | undefined;

  if (!config) {
    ignored.push(file);
    continue;
  }

  const active = Object.fromEntries(
    Object.entries(config.rules ?? {}).filter((entry): entry is [string, Linter.RuleEntry] => enabled(entry[1])),
  );
  const group = {
    rules: active,
    linterOptions: config.linterOptions,
    parserOptions: config.languageOptions?.parserOptions,
    files: [] as string[],
  };
  const key = createHash('sha256').update(serialize(group)).digest('hex');

  if (!groups.has(key)) {
    groups.set(key, group);
  }

  groups.get(key)?.files.push(file);

  for (const [id, options] of Object.entries(active)) {
    const plugin =
      Object.keys(config.plugins ?? {})
        .filter(name => id.startsWith(`${name}/`))
        .toSorted((left, right) => right.length - left.length)[0] ?? 'eslint';
    const name = plugin === 'eslint' ? id : id.slice(plugin.length + 1);
    const rule = plugin === 'eslint' ? builtinRules.get(name) : config.plugins?.[plugin]?.rules?.[name];
    const meta = rule && typeof rule === 'object' ? rule.meta : undefined;
    const metadataRequiresTypes = (meta?.docs as (Rule.RuleMetaData['docs'] & { requiresTypeChecking?: boolean }) | undefined)
      ?.requiresTypeChecking;
    let inventory = rules.get(id);

    if (!inventory) {
      inventory = {
        id,
        plugin,
        name,
        type: meta?.type,
        docs: meta?.docs,
        requiresTypeChecking: Boolean(metadataRequiresTypes) || (plugin === '@eslint-react' && typedReactRules.has(name)),
        variants: [],
        files: [],
      };
      rules.set(id, inventory);
    }

    let variant = inventory.variants.find(item => serialize(item.options) === serialize(options));

    if (!variant) {
      variant = { options, files: [] };
      inventory.variants.push(variant);
    }

    variant.files.push(file);
    inventory.files.push(file);
  }
}

const sortedRules = [...rules.values()].toSorted((left, right) => left.id.localeCompare(right.id));
const summary = {
  head: git('rev-parse', 'HEAD').trim(),
  tree: git('rev-parse', 'HEAD^{tree}').trim(),
  scope: values.scope,
  trackedChanges: git('diff', 'HEAD', '--name-only').trim().length > 0,
  requestedFiles: paths.length,
  configuredFiles: paths.length - ignored.length,
  ignoredFiles: ignored.length,
  configurationGroups: groups.size,
  activeRules: rules.size,
  typeAwareRules: sortedRules.filter(rule => rule.requiresTypeChecking).length,
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${serialize({ summary, rules: sortedRules, groups: [...groups.values()], ignored })}\n`);
console.log(JSON.stringify(summary, null, 2));
