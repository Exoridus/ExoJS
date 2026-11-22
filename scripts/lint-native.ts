/**
 * Delegates only evaluated rule/options pairs to native lint. ESLint remains
 * authoritative: new options, parsers, projects and inline configuration keep
 * their original rules, and ordinary ESLint invocations do not use this split.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ESLint, type Linter } from 'eslint';
import type { OxlintConfig } from 'oxlint';

interface NativeRule {
  native: string;
  typeAware: boolean;
  options: string[];
}

export interface NativePolicy {
  version: 1;
  versions: Record<string, string>;
  parser: { name: string; version: string };
  rules: Record<string, NativeRule>;
}

interface NativeGroup {
  files: string[];
  rules: Record<string, Linter.RuleEntry>;
  globals: Record<string, 'readonly' | 'writable' | 'off'>;
  disabled: string[];
}

interface NativeImplementations {
  language: { instance: unknown; parse: unknown; createSourceCode: unknown };
  parser: { instance: unknown; parse: unknown; parseForESLint: unknown };
  rules: Map<string, { namespace: string; plugin: unknown; rule: unknown; create: unknown }>;
}

interface NativePlan {
  version: 1;
  root: string;
  policy: string;
  globs: string[];
  inputs: Record<string, string>;
  files: Record<string, string>;
  groups: Array<{ files: string[]; rules: string[] }>;
}

export interface NativeLintResult {
  status: number;
  planPath?: string;
  cleanup: () => void;
}

export const NATIVE_PLAN_ENV = 'EXOJS_NATIVE_LINT_PLAN';
const toolingRoot = resolve(import.meta.dirname, '..');
const policyPath = resolve(import.meta.dirname, 'lint-native-policy.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as NativePolicy;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const unixPath = (value: string): string => (sep === '\\' ? value.replaceAll('\\', '/') : value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const canonical = (value: unknown): unknown => {
  if (value instanceof RegExp) {
    return { flags: value.flags, regexp: value.source };
  }

  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map(key => [key, canonical(value[key])]),
    );
  }

  return value;
};

const signature = (value: unknown): string => sha256(JSON.stringify(canonical(value)));
const optionsForNative = (value: Linter.RuleEntry): Linter.RuleEntry =>
  JSON.parse(JSON.stringify(value, (_key, item: unknown) => (item instanceof RegExp ? item.source : item))) as Linter.RuleEntry;

/** A dependency upgrade keeps the original rules until its parity is evaluated. */
export const nativeVersionsMatch = (expected: NativePolicy = policy): boolean => {
  try {
    return Object.entries(expected.versions).every(([path, version]) => {
      const installed = JSON.parse(readFileSync(resolve(toolingRoot, path), 'utf8')) as { version?: string };

      return installed.version === version;
    });
  } catch {
    return false;
  }
};

/** Capture evaluated implementations before configuration can replace a plugin or rule. */
const nativeImplementations = async (): Promise<NativeImplementations | null> => {
  try {
    const [{ default: tseslint }, { default: unicorn }, { default: vitest }, baseline] = await Promise.all([
      import('typescript-eslint'),
      import('eslint-plugin-unicorn'),
      // This pinned plugin has distinct ESM/CJS implementations. Shared ESLint
      // configuration imports its ESM entry; a different layout keeps full ESLint.
      import(pathToFileURL(resolve(toolingRoot, 'packages/exojs-config/node_modules/@vitest/eslint-plugin/dist/index.mjs')).href),
      new ESLint({ cwd: toolingRoot, overrideConfigFile: true }).calculateConfigForFile(resolve(toolingRoot, 'lint-native.js')),
    ]);
    const language: unknown = baseline?.language;
    const parser: unknown = tseslint.parser;
    const plugins: Record<string, unknown> = { '@typescript-eslint': tseslint.plugin, unicorn, vitest };
    const rules: NativeImplementations['rules'] = new Map();

    if (!isRecord(language) || !isRecord(parser)) {
      return null;
    }

    for (const [namespace, plugin] of Object.entries(plugins)) {
      if (!isRecord(plugin) || !isRecord(plugin.rules)) {
        return null;
      }

      for (const [name, rule] of Object.entries(plugin.rules)) {
        if (isRecord(rule)) {
          rules.set(`${namespace}/${name}`, { namespace, plugin, rule, create: rule.create });
        }
      }
    }

    return {
      language: { instance: language, parse: language.parse, createSourceCode: language.createSourceCode },
      parser: { instance: parser, parse: parser.parse, parseForESLint: parser.parseForESLint },
      rules,
    };
  } catch {
    return null;
  }
};

const selectedFiles = (root: string, globs: readonly string[]): string[] =>
  [...new Set(globSync(globs, { cwd: root }).map(unixPath))].toSorted();
const snapshot = (paths: readonly string[]): Record<string, string> =>
  Object.fromEntries(paths.map(path => [path, sha256(readFileSync(path, 'utf8'))]));
const inputFiles = (root: string): string[] =>
  [
    ...new Set([
      policyPath,
      fileURLToPath(import.meta.url),
      ...globSync(['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,json,jsonc}', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'], {
        cwd: root,
        exclude: ['**/node_modules/**', '.git/**', '.workspace/**', '.worktrees/**', '.oxlint-run-*.json'],
      }).map(path => resolve(root, path)),
      ...globSync('packages/exojs-config/eslint/**/*.js', { cwd: toolingRoot }).map(path => resolve(toolingRoot, path)),
    ]),
  ].toSorted();

const nativeGlobals = (globals: unknown): NativeGroup['globals'] | null => {
  const result: NativeGroup['globals'] = {};

  if (globals !== undefined && !isRecord(globals)) {
    return null;
  }

  for (const [name, value] of Object.entries(globals ?? {})) {
    if (value === true || value === 'writable' || value === 'writeable') {
      result[name] = 'writable';
    } else if (value === false || value === 'readonly' || value === 'readable') {
      result[name] = 'readonly';
    } else if (value === 'off') {
      result[name] = 'off';
    } else {
      return null;
    }
  }

  return result;
};

/** Return no native ownership for contexts whose parser or type program differs. */
export const nativeRulesForConfig = (
  config: Linter.Config,
  source: string,
  implementations: NativeImplementations,
  expected: NativePolicy = policy,
): NativeGroup | null => {
  const languageImplementation: unknown = config.language;
  const language = config.languageOptions;
  const parser = language?.parser as { meta?: { name?: string; version?: string }; parse?: unknown; parseForESLint?: unknown } | undefined;
  const parserOptions = language?.parserOptions;

  if (
    config.processor ||
    config.linterOptions?.noInlineConfig ||
    (config.settings && Object.keys(config.settings).length > 0) ||
    languageImplementation !== implementations.language.instance ||
    !isRecord(languageImplementation) ||
    languageImplementation.parse !== implementations.language.parse ||
    languageImplementation.createSourceCode !== implementations.language.createSourceCode ||
    parser !== implementations.parser.instance ||
    parser?.parse !== implementations.parser.parse ||
    parser?.parseForESLint !== implementations.parser.parseForESLint ||
    parser?.meta?.name !== expected.parser.name ||
    parser.meta.version !== expected.parser.version ||
    language?.sourceType !== 'module' ||
    !isRecord(parserOptions) ||
    // Native-only directives must not suppress a rule that ESLint would report.
    // A raw text match also keeps directive-like strings on full ESLint.
    /\/[*/][\s*]*(?:(?:eslint|oxlint)(?:\s|-)|globals?\s|exported\s)/u.test(source) ||
    Object.keys(parserOptions).some(key => !['tsconfigRootDir', 'projectService', 'project', 'program'].includes(key)) ||
    (parserOptions.project !== undefined && parserOptions.project !== null && parserOptions.project !== false) ||
    (parserOptions.program !== undefined && parserOptions.program !== null) ||
    (parserOptions.projectService !== true && parserOptions.projectService !== false)
  ) {
    return null;
  }

  const globals = nativeGlobals(language.globals);

  if (!globals) {
    return null;
  }

  const rules: NativeGroup['rules'] = {};
  const owners = new Map<string, string>();
  const conflicts = new Set<string>();

  for (const [id, options] of Object.entries(config.rules ?? {})) {
    const entry = expected.rules[id];
    const implementation = implementations.rules.get(id);
    const rule = implementation
      ? config.plugins?.[implementation.namespace]?.rules?.[id.slice(implementation.namespace.length + 1)]
      : undefined;

    if (
      !entry ||
      options === undefined ||
      !entry.options.includes(signature(options)) ||
      (entry.typeAware && parserOptions.projectService !== true) ||
      (id.includes('/') &&
        (!implementation ||
          config.plugins?.[implementation.namespace] !== implementation.plugin ||
          rule !== implementation.rule ||
          !isRecord(rule) ||
          rule.create !== implementation.create))
    ) {
      continue;
    }

    if (owners.has(entry.native)) {
      conflicts.add(entry.native);
      continue;
    }

    owners.set(entry.native, id);
    rules[entry.native] = optionsForNative(options);
  }

  for (const name of conflicts) {
    delete rules[name];
    owners.delete(name);
  }

  return owners.size ? { files: [], rules, globals, disabled: [...owners.values()].toSorted() } : null;
};

const validPaths = (root: string, paths: readonly string[]): boolean =>
  paths.every(
    path => !/[\r\n\0*?[\]{}()!#]/u.test(path) && unixPath(relative(root, resolve(root, path))) === path && !path.startsWith('../'),
  );

/**
 * A passed native run creates a temporary residual plan. Each ESLint process
 * verifies the same sources and config before using it; failures never create
 * a plan that can disable rules.
 */
export const runNativeLint = async (root: string, globs: readonly string[]): Promise<NativeLintResult | null> => {
  if (!nativeVersionsMatch() || existsSync(resolve(toolingRoot, 'node_modules/tsrs'))) {
    console.log('lint: native versions have not been validated; using full ESLint.');

    return null;
  }

  const paths = selectedFiles(root, globs);

  if (!validPaths(root, paths)) {
    console.log('lint: paths require the original matcher; using full ESLint.');

    return null;
  }

  const implementations = await nativeImplementations();

  if (!implementations) {
    console.log('lint: evaluated rule implementations are unavailable; using full ESLint.');

    return null;
  }

  const eslint = new ESLint({ cwd: root });
  const groups = new Map<string, NativeGroup>();
  const sourceFiles = snapshot(paths.map(path => resolve(root, path)));
  const inputs = snapshot(inputFiles(root));

  for (const file of paths) {
    // Root configuration files are few, and a basename-only native override
    // can also match a nested basename. Keep these on the original matcher.
    if (!file.includes('/')) {
      continue;
    }

    // ESLint 10 chooses the nearest config for each file. A new nested config
    // keeps full ownership until its complete context has been evaluated.
    if ((await eslint.findConfigFile(resolve(root, file))) !== resolve(root, 'eslint.config.ts')) {
      continue;
    }

    const config = (await eslint.calculateConfigForFile(resolve(root, file))) as Linter.Config | undefined;

    if (!config) {
      continue;
    }

    const group = nativeRulesForConfig(config, readFileSync(resolve(root, file), 'utf8'), implementations);

    if (!group) {
      continue;
    }

    const key = signature(group);

    if (!groups.has(key)) {
      groups.set(key, group);
    }

    groups.get(key)?.files.push(file);
  }

  const candidates = [...groups.values()].flatMap(group => group.files);

  if (!candidates.length) {
    return null;
  }

  const id = randomUUID();
  const configPath = resolve(root, `.oxlint-run-${id}.json`);
  const planDirectory = resolve(root, '.workspace/lint-native', id);
  const planPath = resolve(planDirectory, 'eslint-plan.json');

  const cleanup = (): void => {
    rmSync(configPath, { force: true });
    rmSync(planDirectory, { recursive: true, force: true });
  };

  const nativeConfig: OxlintConfig = {
    plugins: ['typescript', 'unicorn', 'vitest'],
    categories: { correctness: 'off', suspicious: 'off', pedantic: 'off', perf: 'off', style: 'off', restriction: 'off', nursery: 'off' },
    options: { typeAware: true, reportUnusedDisableDirectives: 'error' },
    // Keep directories traversable, and admit only files whose effective
    // ESLint configuration was inspected. This also bounds command length on Windows.
    ignorePatterns: ['**/*', '!**/', ...candidates.map(file => `!/${file}`)],
    overrides: [...groups.values()].map(({ files, rules, globals }) => ({ files, rules, globals })) as OxlintConfig['overrides'],
  };

  writeFileSync(configPath, `${JSON.stringify(nativeConfig)}\n`, { flag: 'wx' });

  try {
    const oxlint = fileURLToPath(new URL('./bin/oxlint', import.meta.resolve('oxlint/package.json')));
    const backendRequire = createRequire(import.meta.resolve('oxlint-tsgolint/package.json'));
    const backend = backendRequire.resolve(
      `@oxlint-tsgolint/${process.platform}-${process.arch}/tsgolint${process.platform === 'win32' ? '.exe' : ''}`,
    );
    const env = { ...process.env, OXLINT_TSGOLINT_PATH: backend };
    const roots = [...new Set(candidates.map(file => file.split('/')[0]))];
    const args = [oxlint, '-c', configPath, '--no-ignore', '--max-warnings=0'];
    const discovery = spawnSync(process.execPath, [...args, '--debug', 'files', '--', ...roots], {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });

    if (discovery.status !== 0) {
      process.stderr.write(discovery.stderr ?? '');
      cleanup();

      return { status: discovery.status ?? 1, cleanup };
    }

    const discovered = new Set(discovery.stdout.split(/\r?\n/u).filter(Boolean).map(unixPath));
    const expected = new Set(candidates);

    if ([...discovered].some(file => !expected.has(file))) {
      throw new Error('Native lint discovered files outside its validated inventory.');
    }

    if (!discovered.size) {
      cleanup();

      return null;
    }

    console.log(`\n=== lint: native (${String(discovered.size)} files; original ESLint retained elsewhere) ===\n`);

    const result = spawnSync(process.execPath, [...args, '--', ...roots], { cwd: root, env, stdio: 'inherit' });

    if (result.status !== 0) {
      cleanup();

      return { status: result.status ?? 1, cleanup };
    }

    const plan: NativePlan = {
      version: 1,
      root,
      policy: sha256(readFileSync(policyPath, 'utf8')),
      globs: [...globs],
      inputs,
      files: sourceFiles,
      groups: [...groups.values()]
        .map(group => ({ files: group.files.filter(file => discovered.has(file)), rules: group.disabled }))
        .filter(group => group.files.length > 0),
    };

    mkdirSync(planDirectory, { recursive: true });
    writeFileSync(planPath, `${JSON.stringify(plan)}\n`, { flag: 'wx' });

    return { status: 0, planPath, cleanup };
  } catch (error) {
    cleanup();

    throw error;
  }
};

/** Ordinary ESLint keeps all rules. Only a current, passed native plan can offload any. */
export const nativeEslintOverrides = (root: string): Linter.Config[] => {
  const path = process.env[NATIVE_PLAN_ENV];

  if (path === undefined) {
    return [];
  }

  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

  if (
    !isAbsolute(path) ||
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    typeof parsed.root !== 'string' ||
    !isAbsolute(parsed.root) ||
    // Jiti uses forward slashes for import.meta.dirname on Windows.
    resolve(parsed.root) !== resolve(root) ||
    !Array.isArray(parsed.globs) ||
    !parsed.globs.every(item => typeof item === 'string') ||
    !isRecord(parsed.inputs) ||
    !isRecord(parsed.files) ||
    !Array.isArray(parsed.groups)
  ) {
    throw new Error('Invalid native lint completion plan.');
  }

  const plan = parsed as unknown as NativePlan;
  const sourcePaths = selectedFiles(root, plan.globs).map(file => resolve(root, file));
  const configurationPaths = inputFiles(root);
  const unchanged =
    nativeVersionsMatch() &&
    plan.policy === sha256(readFileSync(policyPath, 'utf8')) &&
    sourcePaths.length === Object.keys(plan.files).length &&
    sourcePaths.every(file => plan.files[file] === sha256(readFileSync(file, 'utf8'))) &&
    configurationPaths.length === Object.keys(plan.inputs).length &&
    configurationPaths.every(file => plan.inputs[file] === sha256(readFileSync(file, 'utf8')));

  if (!unchanged) {
    console.log('lint: inputs changed after native lint; keeping full ESLint.');

    return [];
  }

  return plan.groups.map(group => {
    if (
      !isRecord(group) ||
      !Array.isArray(group.files) ||
      !group.files.every(file => typeof file === 'string' && plan.files[resolve(root, file)] !== undefined) ||
      !Array.isArray(group.rules) ||
      !group.rules.every(rule => typeof rule === 'string' && policy.rules[rule] !== undefined)
    ) {
      throw new Error('Invalid native lint rule ownership.');
    }

    return { files: group.files, rules: Object.fromEntries(group.rules.map(rule => [rule, 'off' as const])) };
  });
};
