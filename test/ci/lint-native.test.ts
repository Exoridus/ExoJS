import { execFileSync, spawnSync } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repository = process.cwd();
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && name !== 'EXOJS_NATIVE_LINT_PLAN'),
);
const emptyFile = 'export {};\n';
const sources = [
  'src/entry.ts',
  'test/entry.test.ts',
  'examples/entry.ts',
  'packages/exojs-fixture/src/entry.ts',
  'packages/exojs-fixture/test/entry.test.ts',
  'packages/exojs-react/examples/entry.tsx',
  'packages/create-exo-app/src/entry.ts',
  'packages/eslint-plugin-exojs/src/entry.ts',
  'packages/eslint-plugin-exojs/test/entry.test.ts',
];

describe('native lint ownership through the real CLI', () => {
  let root: string;

  const write = (file: string, contents: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  };

  const configure = (overrides = '', debuggerSeverity = 'error'): void => {
    write(
      'eslint.config.ts',
      `import tseslint from 'typescript-eslint';
import { nativeEslintOverrides } from './scripts/lint-native.ts';
const custom = { rules: { 'no-marker': {
  meta: { type: 'problem', schema: [], messages: { marker: 'Custom coverage marker.' } },
  create(context) { return { Identifier(node) { if (node.name === 'forbidden') context.report({ node, messageId: 'marker' }); } }; }
} } };
export default [
  { ignores: ['src/vendor/**'] },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
      parserOptions: { tsconfigRootDir: import.meta.dirname, projectService: false, project: null, program: null }
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { '@typescript-eslint': tseslint.plugin, fixture: custom },
    rules: { 'no-debugger': '${debuggerSeverity}', eqeqeq: ['error', 'always', { null: 'ignore' }], 'fixture/no-marker': 'error' }
  },
  ${overrides}
  ...nativeEslintOverrides(import.meta.dirname)
];
`,
    );
  };

  const run = (args: string[] = [], script = 'scripts/lint.ts') =>
    spawnSync(process.execPath, [join(root, script), ...args], {
      cwd: root,
      // Dependency package files are read-only links; this fixture owns every
      // generated plan, ESLint cache and source. Disable Jiti's disk cache too.
      env: { ...childEnv, JITI_FS_CACHE: '0', FORCE_COLOR: '0' },
      encoding: 'utf8',
      timeout: 25_000,
      maxBuffer: 8 * 1024 * 1024,
    });

  const assertCleaned = (): void => {
    expect(globSync('.oxlint-run-*.json', { cwd: root })).toEqual([]);
    expect(globSync('.workspace/lint-native/*/eslint-plan.json', { cwd: root })).toEqual([]);
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-native-lint-')));
    write('package.json', '{"type":"module"}\n');
    write('.gitignore', 'node_modules\n.workspace\n.*\n');
    execFileSync('git', ['init', '-q'], { cwd: root, env: childEnv });

    for (const file of ['scripts/lint.ts', 'scripts/lint-native.ts', 'scripts/lint-native-policy.json']) {
      write(file, readFileSync(join(repository, file), 'utf8'));
    }

    const dependencies = [
      'node_modules/eslint',
      'node_modules/typescript',
      'node_modules/typescript-eslint',
      'node_modules/eslint-plugin-unicorn',
      'node_modules/oxlint',
      'node_modules/oxlint-tsgolint',
      'packages/exojs-config/node_modules/@vitest/eslint-plugin',
    ];

    for (const dependency of dependencies) {
      const target = join(root, dependency);

      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(realpathSync(join(repository, dependency)), target, process.platform === 'win32' ? 'junction' : 'dir');
    }

    for (const file of sources) {
      write(file, emptyFile);
    }

    configure();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs native rules once and each original ESLint pass once on clean source', () => {
    const result = run();

    expect({ status: result.status, signal: result.signal, error: result.error, stderr: result.stderr }).toEqual({
      status: 0,
      signal: null,
      error: undefined,
      stderr: '',
    });
    expect(result.stdout.match(/=== lint: native/gu)).toHaveLength(1);
    expect(result.stdout.match(/=== lint: engine/gu)).toHaveLength(1);
    expect(result.stdout.match(/=== lint: packages/gu)).toHaveLength(1);
    assertCleaned();
  });

  it.each(['src/entry.ts', 'src/New file \u96EA.ts'])('detects a native error in modified or new file %s', file => {
    write(file, 'debugger;\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== lint: native');
    expect(result.stdout).toContain('no-debugger');
    expect(result.stdout).not.toContain('=== lint: engine');
    assertCleaned();
  });

  it('retains a custom rule on files whose native rules have already passed', () => {
    write('src/entry.ts', 'export const forbidden = 1;\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== lint: native');
    expect(result.stdout).toContain('=== lint: engine');
    expect(result.stdout).toContain('Custom coverage marker');
    assertCleaned();
  });

  it('preserves used suppressions and rejects unused suppressions with full ESLint', () => {
    write('src/entry.ts', '// eslint-disable-next-line no-debugger\ndebugger;\n');
    expect(run().status).toBe(0);
    write('src/entry.ts', '// eslint-disable-next-line no-debugger\nexport const value = 1;\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Unused eslint-disable directive');
    assertCleaned();
  });

  it.each([
    ['next-line', '// oxlint-disable-next-line no-debugger\ndebugger;\n'],
    ['same-line', 'debugger; // oxlint-disable-line no-debugger\n'],
    ['block', '/* oxlint-disable no-debugger */\ndebugger;\n/* oxlint-enable no-debugger */\n'],
  ])('keeps native-only %s suppressions from disabling ESLint rules', (_kind, source) => {
    write('src/entry.ts', source);

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== lint: engine');
    expect(result.stdout).toContain('no-debugger');
    assertCleaned();
  });

  it('keeps named-project imported promise checks on ESLint', () => {
    configure(
      `{ files: ['examples/**/*.ts'], languageOptions: { parserOptions: { project: './tsconfig.examples.json', projectService: false } }, rules: { '@typescript-eslint/no-floating-promises': 'error' } },`,
    );
    write(
      'tsconfig.examples.json',
      '{"compilerOptions":{"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","paths":{"@fixture/runtime":["./examples/runtime.ts"]}},"include":["examples/**/*.ts"]}\n',
    );
    write('examples/runtime.ts', 'export const promise = (): Promise<void> => Promise.resolve();\n');
    write('examples/entry.ts', "import { promise } from '@fixture/runtime';\npromise();\n");

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== lint: engine');
    expect(result.stdout).toContain('@typescript-eslint/no-floating-promises');
    assertCleaned();
  });

  it('retains original ignores and full coverage for Git-ignored authored files', () => {
    // A distinct group whose only file disappears from native discovery must
    // stay on full ESLint, without constructing an invalid empty files array.
    configure("{ files: ['src/git-ignored.ts'], languageOptions: { globals: { fixtureGlobal: 'readonly' } } },");
    write('src/vendor/invalid.ts', 'debugger;\n');
    expect(run().status).toBe(0);
    write('.gitignore', 'node_modules\n.workspace\n.*\nsrc/git-ignored.ts\n');
    write('src/git-ignored.ts', 'debugger;\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== lint: engine');
    expect(result.stdout).toContain('src/git-ignored.ts');
    assertCleaned();
  });

  it('keeps nested configurations and custom parser contexts entirely on ESLint', () => {
    configure(
      `{ files: ['src/custom.ts'], languageOptions: { parser: { ...tseslint.parser, meta: { ...tseslint.parser.meta, name: 'custom-fixture' } } } },`,
    );
    write('src/custom.ts', 'debugger;\n');
    write('src/nested/eslint.config.ts', "import base from '../../eslint.config.ts';\nexport default base;\n");
    write('src/nested/entry.ts', 'debugger;\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== lint: engine');
    expect(result.stdout).toContain('src/custom.ts');
    expect(result.stdout).toContain('src/nested/entry.ts');
    assertCleaned();
  });

  it('keeps an unvalidated rule option variant on ESLint', () => {
    configure('', 'warn');
    write('src/entry.ts', 'debugger;\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('=== lint: engine');
    expect(result.stdout).toContain('warning');
    expect(result.stderr).toContain('ESLint found too many warnings');
    assertCleaned();
  });

  it('falls back to full ESLint when an implementation version changes', () => {
    const policyPath = join(root, 'scripts/lint-native-policy.json');
    const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as { versions: Record<string, string> };

    policy.versions['node_modules/oxlint/package.json'] = '0.0.0';
    writeFileSync(policyPath, JSON.stringify(policy));
    write('src/entry.ts', 'debugger;\n');

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('using full ESLint');
    expect(result.stdout).not.toContain('=== lint: native');
    expect(result.stdout).toContain('no-debugger');
    assertCleaned();
  });

  it('forwards ESLint flags without performing a partial native interpretation', () => {
    write('src/entry.ts', 'debugger;\n');

    const result = run(['--rule', 'no-debugger:off']);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('=== lint: native');
    expect(result.stdout).toContain('=== lint: packages');
    assertCleaned();
  });

  it.each(['modified', 'added', 'configuration'] as const)('invalidates native ownership after %s inputs change', change => {
    if (change === 'configuration') {
      write('src/entry.ts', 'export const value = null;\nif (value == null) {}\n');
    }

    const mutation =
      change === 'configuration'
        ? "writeFileSync('eslint.config.ts', readFileSync('eslint.config.ts', 'utf8').replace(\"null: 'ignore'\", \"null: 'always'\"));"
        : `writeFileSync('${change === 'added' ? 'src/added.ts' : 'src/entry.ts'}', 'debugger;\\n');`;

    write(
      'changed-input-driver.mjs',
      `import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNativeLint, NATIVE_PLAN_ENV } from ${JSON.stringify(pathToFileURL(join(root, 'scripts/lint-native.ts')).href)};
const result = await runNativeLint(process.cwd(), ['src/**/*.ts']);
if (!result?.planPath || result.status !== 0) throw new Error('Expected a passed native completion plan.');
try {
  ${mutation}
  const eslint = fileURLToPath(new URL('./bin/eslint.js', import.meta.resolve('eslint/package.json')));
  const child = spawnSync(process.execPath, [eslint, '--max-warnings=0', 'src/**/*.ts'], { stdio: 'inherit', env: { ...process.env, [NATIVE_PLAN_ENV]: result.planPath } });
  process.exitCode = child.status ?? 1;
} finally { result.cleanup(); }
`,
    );

    const result = run([], 'changed-input-driver.mjs');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('inputs changed after native lint; keeping full ESLint');
    expect(result.stdout).toContain(change === 'configuration' ? 'eqeqeq' : 'no-debugger');
    assertCleaned();
  });
  it('invalidates type-aware ownership when a TypeScript path mapping changes after native lint', () => {
    configure(
      "{ files: ['src/**/*.ts'], languageOptions: { parserOptions: { projectService: true } }, rules: { '@typescript-eslint/no-floating-promises': 'error' } },",
    );
    write('src/sync.ts', 'export const task = (): void => {};\n');
    write('src/async.ts', 'export const task = (): Promise<void> => Promise.resolve();\n');
    write('src/entry.ts', "import { task } from '@fixture/runtime';\ntask();\n");
    write(
      'tsconfig.json',
      '{"compilerOptions":{"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","paths":{"@fixture/runtime":["./src/sync.ts"]}},"include":["src/**/*.ts"]}\n',
    );
    write(
      'type-input-driver.mjs',
      `import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNativeLint, NATIVE_PLAN_ENV } from './scripts/lint-native.ts';
const result = await runNativeLint(process.cwd(), ['src/**/*.ts']);
if (!result?.planPath || result.status !== 0) throw new Error('Expected a passed native completion plan.');
try {
  writeFileSync('tsconfig.json', readFileSync('tsconfig.json', 'utf8').replace('./src/sync.ts', './src/async.ts'));
  const eslint = fileURLToPath(new URL('./bin/eslint.js', import.meta.resolve('eslint/package.json')));
  const child = spawnSync(process.execPath, [eslint, '--max-warnings=0', 'src/**/*.ts'], { stdio: 'inherit', env: { ...process.env, [NATIVE_PLAN_ENV]: result.planPath } });
  process.exitCode = child.status ?? 1;
} finally { result.cleanup(); }
`,
    );

    const result = run([], 'type-input-driver.mjs');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('inputs changed after native lint; keeping full ESLint');
    expect(result.stdout).toContain('@typescript-eslint/no-floating-promises');
    assertCleaned();
  });

  it('invalidates a plan when a new nested JavaScript ESLint configuration appears', () => {
    write('src/nested/entry.ts', 'export const value = null;\nif (value == null) {}\n');

    const nested =
      'import base from "../../eslint.config.ts";\nexport default [...base, {rules:{eqeqeq:["error","always",{null:"always"}]}}];\n';

    write(
      'nested-config-driver.mjs',
      `import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNativeLint, NATIVE_PLAN_ENV } from './scripts/lint-native.ts';
const result = await runNativeLint(process.cwd(), ['src/**/*.ts']);
if (!result?.planPath || result.status !== 0) throw new Error('Expected a passed native completion plan.');
try {
  writeFileSync('src/nested/eslint.config.mjs', ${JSON.stringify(nested)});
  const eslint = fileURLToPath(new URL('./bin/eslint.js', import.meta.resolve('eslint/package.json')));
  const child = spawnSync(process.execPath, [eslint, '--max-warnings=0', 'src/**/*.ts'], { stdio: 'inherit', env: { ...process.env, [NATIVE_PLAN_ENV]: result.planPath } });
  process.exitCode = child.status ?? 1;
} finally { result.cleanup(); }
`,
    );

    const result = run([], 'nested-config-driver.mjs');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('inputs changed after native lint; keeping full ESLint');
    expect(result.stdout).toContain('eqeqeq');
    assertCleaned();
  });
});
