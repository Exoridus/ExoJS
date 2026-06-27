/**
 * create:package — scaffold a new lockstep extension package.
 *
 * `pnpm create:package <name> [flags]` generates `packages/exojs-<name>/` from
 * the conventions the existing extension packages share (aseprite/tiled for the
 * register style, physics/audio-fx for the library style), then auto-wires it
 * into the single sources of truth so adding a package is one command instead of
 * a ~10-file hand-edit.
 *
 * Auto-wired (string-edit, idempotent):
 *   - scripts/release/lockstep-packages.ts  (LOCKSTEP_PACKAGES entry — the SoT
 *     every release script derives from: cut/manifest/prepare/run/verify-*)
 *   - scripts/ci/select-lanes.mjs           (RUNTIME_PACKAGES entry)
 *   - pnpm-workspace.yaml                    (explicit member list, not a glob)
 *
 * NOT auto-wired (enumerated YAML / a different runtime / a manual bootstrap) —
 * printed as a concrete, copy-pasteable checklist at the end:
 *   - .github/workflows/_ci-checks.yml + release.yml `--filter` lines
 *   - vitest.config.ts createJsdomTestProject entry (+ aliasConfig if imported)
 *   - root package.json typecheck:packages / test / test:coverage lists
 *   - the npm placeholder publish + Trusted-Publisher (OIDC) bootstrap from
 *     scripts/release/RELEASING.md (do this BEFORE the package's first release)
 *
 * Usage:
 *   pnpm create:package <name>                       # library (default)
 *   pnpm create:package <name> --register            # ships /register
 *   pnpm create:package <name> --dep tilemap         # runtime workspace dep
 *   pnpm create:package <name> --description "…"      # manifest description
 *   pnpm create:package <name> --no-offline-smoke    # exclude from offline smoke
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Argument parsing ─────────────────────────────────────────────────────────

interface Options {
  name: string;
  register: boolean;
  deps: string[];
  description?: string;
  inOfflineSmoke: boolean;
}

const USAGE = `Usage: pnpm create:package <name> [--register | --library] [--dep <pkg>]... [--description "<text>"] [--no-offline-smoke]

  <name>               bare package name without the "exojs-"/scope prefix (kebab-case), e.g. "spine"
  --register           ship a /register side-effect entry (extension style: aseprite, tiled)
  --library            DEFAULT — sideEffects:false, no /register (library style: physics, audio-fx)
  --dep <pkg>          add a runtime workspace dependency on @codexo/exojs-<pkg> (repeatable / comma list)
  --description "..."  package.json description
  --no-offline-smoke   exclude from the offline external-consumer smoke (react is the precedent)`;

function fail(message: string): never {
  process.stderr.write(`create:package: ${message}\n\n${USAGE}\n`);
  process.exit(1);
}

function parseArgs(argv: readonly string[]): Options {
  let name: string | undefined;
  let register = false;
  let library = false;
  const deps: string[] = [];
  let description: string | undefined;
  let inOfflineSmoke = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    const flag = arg.startsWith('--') && eq !== -1 ? arg.slice(0, eq) : arg;
    const inlineValue = arg.startsWith('--') && eq !== -1 ? arg.slice(eq + 1) : undefined;
    const takeValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[++i];
      if (next === undefined) fail(`${flag} expects a value`);
      return next;
    };

    switch (flag) {
      case '--register':
        register = true;
        break;
      case '--library':
        library = true;
        break;
      case '--dep':
        for (const d of takeValue().split(',')) {
          const trimmed = d.trim();
          if (trimmed) deps.push(trimmed);
        }
        break;
      case '--description':
        description = takeValue();
        break;
      case '--no-offline-smoke':
        inOfflineSmoke = false;
        break;
      case '--help':
      case '-h':
        process.stdout.write(`${USAGE}\n`);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) fail(`unknown flag: ${arg}`);
        if (name !== undefined) fail(`unexpected extra argument: ${arg}`);
        name = arg;
    }
  }

  if (name === undefined) fail('a package <name> is required');
  if (register && library) fail('--register and --library are mutually exclusive');

  // Tolerate a leading scope/prefix the user may have typed; the canonical name
  // is the bare kebab segment.
  name = name.replace(/^@codexo\//, '').replace(/^exojs-/, '');

  return { name, register, deps, ...(description !== undefined ? { description } : {}), inOfflineSmoke };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const toCamel = (kebab: string): string => kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toPascal = (kebab: string): string => {
  const camel = toCamel(kebab);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};
const toTitle = (kebab: string): string =>
  kebab
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const writeFile = (relPath: string, contents: string): void => {
  writeFileSync(resolve(pkgDir, relPath), contents, 'utf8');
};

/** Insert `lines` (each gets a trailing newline) immediately before `anchor`. */
const insertBefore = (content: string, anchor: string, lines: readonly string[]): string => {
  const idx = content.indexOf(anchor);
  if (idx === -1) throw new Error(`anchor not found: ${anchor}`);
  return content.slice(0, idx) + lines.map(l => `${l}\n`).join('') + content.slice(idx);
};

// ── Parse + validate ─────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
const { name, register, deps, inOfflineSmoke } = opts;

if (!KEBAB_RE.test(name)) fail(`name "${name}" is not kebab-case (lowercase letters/digits, single dashes)`);

const pkgName = `@codexo/exojs-${name}`;
const pkgDirRel = `packages/exojs-${name}`;
const pkgDir = resolve(rootDir, pkgDirRel);

if (existsSync(pkgDir)) fail(`directory already exists: ${pkgDirRel}`);

const lockstepPath = resolve(rootDir, 'scripts/release/lockstep-packages.ts');
const lockstepSrc = readFileSync(lockstepPath, 'utf8');
if (lockstepSrc.includes(`'${pkgName}'`)) fail(`${pkgName} is already in LOCKSTEP_PACKAGES`);

for (const dep of deps) {
  if (!KEBAB_RE.test(dep)) fail(`--dep "${dep}" is not kebab-case`);
  if (!existsSync(resolve(rootDir, `packages/exojs-${dep}`))) {
    fail(`--dep "${dep}" → packages/exojs-${dep} does not exist`);
  }
}

const camel = toCamel(name);
const description = opts.description ?? `${toTitle(name)} ${register ? 'extension' : 'library'} for ExoJS.`;

// Version is shared across all lockstep packages — read it from Core rather than
// hard-coding, so the scaffold always matches the current in-tree version.
const coreVersion = (JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as { version: string }).version;
const [major, minor] = coreVersion.split('.');
const peerRange = `${major}.${minor}.x`;

// ── Generate package files ───────────────────────────────────────────────────

mkdirSync(resolve(pkgDir, 'src'), { recursive: true });
mkdirSync(resolve(pkgDir, 'test'), { recursive: true });

const generated: string[] = [];
const emit = (relPath: string, contents: string): void => {
  writeFile(relPath, contents);
  generated.push(`${pkgDirRel}/${relPath}`);
};

// package.json — key order mirrors the reference packages exactly.
const manifest: Record<string, unknown> = {
  name: pkgName,
  version: coreVersion,
  description,
  repository: {
    type: 'git',
    url: 'git+https://github.com/Exoridus/ExoJS.git',
    directory: pkgDirRel,
  },
  type: 'module',
  sideEffects: register ? ['./dist/esm/register.js'] : false,
  main: './dist/esm/index.js',
  module: './dist/esm/index.js',
  types: './dist/esm/index.d.ts',
  exports: {
    '.': {
      types: './dist/esm/index.d.ts',
      import: './dist/esm/index.js',
      default: './dist/esm/index.js',
    },
    ...(register
      ? {
          './register': {
            types: './dist/esm/register.d.ts',
            import: './dist/esm/register.js',
            default: './dist/esm/register.js',
          },
        }
      : {}),
    './package.json': './package.json',
  },
  files: ['dist/esm/', 'README.md', 'LICENSE'],
  scripts: {
    build: 'tsx ../../node_modules/rollup/dist/bin/rollup -c --environment EXOJS_ENV:production',
    'build:dev': 'tsx ../../node_modules/rollup/dist/bin/rollup -c --environment EXOJS_ENV:development',
    typecheck: 'tsc --noEmit',
    lint: 'eslint "src/**/*.ts" "test/**/*.ts"',
    test: `vitest run --root ../.. --project=exojs-${name}`,
  },
  peerDependencies: { '@codexo/exojs': peerRange },
  ...(deps.length ? { dependencies: Object.fromEntries(deps.map(d => [`@codexo/exojs-${d}`, 'workspace:*'])) } : {}),
  devDependencies: {
    '@codexo/exojs': 'workspace:*',
    '@codexo/exojs-config': 'workspace:*',
  },
  license: 'MIT',
  publishConfig: { access: 'public' },
};
emit('package.json', `${JSON.stringify(manifest, null, 2)}\n`);

// tsconfig.json — Core paths to source (+ each runtime dep), like aseprite/tiled.
// Hand-built (not JSON.stringify) to keep the references' inline-array style.
const pathEntries: [string, string][] = [
  ['@codexo/exojs', '../../src/index.ts'],
  ['@codexo/exojs/extensions', '../../src/extensions/index.ts'],
  ['@codexo/exojs/renderer-sdk', '../../src/renderer-sdk.ts'],
  ['@codexo/exojs/debug', '../../src/debug/index.ts'],
  ...deps.map((dep): [string, string] => [`@codexo/exojs-${dep}`, `../exojs-${dep}/src/index.ts`]),
];
const pathLines = pathEntries.map(([k, v]) => `      "${k}": ["${v}"]`).join(',\n');

// A runtime dep that uses package-internal `#` imports exposes its OWN source
// condition (e.g. particles → '@codexo/exojs-particles-source'). Without it in
// customConditions, tsc resolves the dep's `#` imports to its stale dist and the
// dep's src↔dist class identities diverge ("two declarations of a private
// property"). Pull each dep's source condition from its imports map so the
// cross-package source typecheck stays clean. Deps with no `#` imports
// (tilemap, etc.) contribute nothing.
const SOURCE_CONDITION_RE = /-source$/;
const customConditions = ['@codexo/source'];
for (const dep of deps) {
  const depPkg = JSON.parse(readFileSync(resolve(rootDir, `packages/exojs-${dep}/package.json`), 'utf8')) as {
    imports?: Record<string, unknown>;
  };
  const star = depPkg.imports?.['#*'];
  if (star && typeof star === 'object') {
    for (const cond of Object.keys(star)) {
      if (SOURCE_CONDITION_RE.test(cond) && !customConditions.includes(cond)) customConditions.push(cond);
    }
  }
}
const conditionsLine = `[${customConditions.map(c => `"${c}"`).join(', ')}]`;

emit(
  'tsconfig.json',
  `{
  "extends": "@codexo/exojs-config/typescript/extension.json",
  "compilerOptions": {
    "customConditions": ${conditionsLine},
    "paths": {
${pathLines}
    }
  },
  "include": ["src/**/*", "../../src/typings.d.ts"],
  "exclude": ["dist", "node_modules", "test"]
}
`,
);

// rollup.config.ts — register builds index + register (factory default); library
// builds index only. No internal `#` imports, so sourceCondition is null.
const rollupConfig = register
  ? `import { createExtensionConfig } from '@codexo/exojs-config/rollup';

// ${pkgName} ships a /register side-effect entry alongside the side-effect-free
// root. No package-internal \`#\` imports (all same-directory \`./\`), so no source
// condition / node-resolve is needed; Core's \`#\` resolves to its dist.
export default createExtensionConfig({
  root: import.meta.dirname,
  sourceCondition: null,
});
`
  : `import { createExtensionConfig } from '@codexo/exojs-config/rollup';

// ${pkgName} is a library package (no /register): a single side-effect-free
// entry. No package-internal \`#\` imports (all same-directory \`./\`), so no source
// condition / node-resolve is needed; Core's \`#\` resolves to its dist.
export default createExtensionConfig({
  root: import.meta.dirname,
  sourceCondition: null,
  inputs: ['src/index.ts'],
});
`;
emit('rollup.config.ts', rollupConfig);

// src/index.ts
const indexHeader = register
  ? `// ${pkgName} — side-effect-free root entry.
// Importing this entry does NOT register the extension globally.
// Use ${pkgName}/register for global registration.`
  : `// ${pkgName} — side-effect-free root entry.`;
emit('src/index.ts', `${indexHeader}\n\nexport * from './public';\n`);

// src/public.ts — a small placeholder so TypeDoc/typecheck has a public symbol.
const depTypeExports = deps
  .map(
    dep => `
/**
 * Type handle proving the @codexo/exojs-${dep} runtime dependency resolves.
 * Replace it with this package's real use of the dependency.
 */
export type ${toPascal(dep)}Module = typeof import('@codexo/exojs-${dep}');`,
  )
  .join('\n');

const publicTs = register
  ? `// Side-effect-free public API for ${pkgName}.
// No registration is performed on import.

import type { Extension } from '@codexo/exojs/extensions';

/**
 * Default immutable extension descriptor for ${pkgName}.
 *
 * Register it explicitly via \`ApplicationOptions.extensions\`, or import
 * \`${pkgName}/register\` for global auto-registration. Replace the empty
 * descriptor below with this package's real renderer/asset/serializer bindings.
 */
export const ${camel}Extension: Extension = Object.freeze({
  id: '${pkgName}',
});
${depTypeExports}
`
  : `// Side-effect-free public API for ${pkgName}.

/**
 * Placeholder so TypeDoc and the typecheck gate have a stable public symbol.
 * Replace it with this package's real API.
 */
export const ${camel}PackageName = '${pkgName}' as const;
${depTypeExports}
`;
emit('src/public.ts', publicTs);

// src/register.ts — only for register mode (the single side-effectful entry).
if (register) {
  emit(
    'src/register.ts',
    `// ${pkgName}/register — explicit registration entry.
// Importing this entry registers the default ${camel}Extension descriptor in the
// global ExtensionRegistry. Subsequently constructed Applications that use global
// defaults will receive this extension. This is the only side-effectful entry.

import { ExtensionRegistry } from '@codexo/exojs/extensions';

import { ${camel}Extension } from './public';

ExtensionRegistry.register(${camel}Extension);

export * from './public';
`,
  );
}

// test/<name>.test.ts — a trivial smoke test (mirrors the package tests'
// relative `../src/index` import convention).
const testSymbol = register ? `${camel}Extension` : `${camel}PackageName`;
emit(
  `test/${name}.test.ts`,
  `import { describe, expect, it } from 'vitest';

import { ${testSymbol} } from '../src/index';

describe('${pkgName}', () => {
  it('exposes its public API', () => {
    expect(${testSymbol}).toBeDefined();
  });
});
`,
);

// README.md
const compatTable = `## Core compatibility

| \`${pkgName}\` | \`@codexo/exojs\` |
|---|---|
| ${major}.${minor}.x | ${major}.${minor}.x |`;

const installDeps = ['@codexo/exojs', pkgName, ...deps.map(d => `@codexo/exojs-${d}`)].join(' ');

const readme = register
  ? `# ${pkgName}

${description}

> Official ExoJS extension. \`@codexo/exojs\` is a peer dependency.

## Installation

\`\`\`sh
npm install ${installDeps}
\`\`\`

## Usage

Freshly scaffolded — replace the placeholder \`${camel}Extension\` descriptor in
\`src/public.ts\` (and this section) with the real API.

\`\`\`ts
import { Application } from '@codexo/exojs';
import { ${camel}Extension } from '${pkgName}';

const app = new Application({ extensions: [${camel}Extension] });
\`\`\`

## \`/register\` convenience entry

\`\`\`ts
// Side effect: registers ${camel}Extension in the global ExtensionRegistry.
import '${pkgName}/register';
\`\`\`

Importing the package root (\`${pkgName}\`) does **not** register anything — that is
the only side-effectful entry.

${compatTable}

## License

MIT © Codexo
`
  : `# ${pkgName}

${description}

> A peer-dependency library on top of \`@codexo/exojs\` (no \`/register\` entry —
> construct its API directly).

## Installation

\`\`\`sh
npm install ${installDeps}
\`\`\`

## Usage

Freshly scaffolded — replace the placeholder \`${camel}PackageName\` export in
\`src/public.ts\` (and this section) with the real API.

\`\`\`ts
import { ${camel}PackageName } from '${pkgName}';
\`\`\`

${compatTable}

## License

MIT © Codexo
`;
emit('README.md', readme);

// LICENSE — copy the MIT text from a sibling package verbatim.
emit('LICENSE', readFileSync(resolve(rootDir, 'packages/exojs-aseprite/LICENSE'), 'utf8'));

// ── Auto-wire the single sources of truth (idempotent) ───────────────────────

const wired: string[] = [];

// 1. scripts/release/lockstep-packages.ts — append a LockstepPackage entry.
{
  const entry = `  { name: '${pkgName}', dir: '${pkgDirRel}', isExtension: true, hasRegister: ${register}, inOfflineSmoke: ${inOfflineSmoke} },`;
  const updated = insertBefore(lockstepSrc, '] as const satisfies readonly LockstepPackage[];', [entry]);
  writeFileSync(lockstepPath, updated, 'utf8');
  wired.push('scripts/release/lockstep-packages.ts (LOCKSTEP_PACKAGES)');
}

// 2. scripts/ci/select-lanes.mjs — append the directory to RUNTIME_PACKAGES.
{
  const lanesPath = resolve(rootDir, 'scripts/ci/select-lanes.mjs');
  const src = readFileSync(lanesPath, 'utf8');
  const dirName = `exojs-${name}`;
  if (src.includes(`'${dirName}'`)) {
    wired.push('scripts/ci/select-lanes.mjs (already present)');
  } else {
    const arrayStart = src.indexOf('const RUNTIME_PACKAGES = [');
    if (arrayStart === -1) throw new Error('RUNTIME_PACKAGES array not found in select-lanes.mjs');
    const closeIdx = src.indexOf('];', arrayStart);
    if (closeIdx === -1) throw new Error('RUNTIME_PACKAGES closing not found in select-lanes.mjs');
    const updated = `${src.slice(0, closeIdx)}  '${dirName}',\n${src.slice(closeIdx)}`;
    writeFileSync(lanesPath, updated, 'utf8');
    wired.push('scripts/ci/select-lanes.mjs (RUNTIME_PACKAGES)');
  }
}

// 3. pnpm-workspace.yaml — explicit member list (NOT a glob), so a new package is
// invisible to pnpm until listed here.
{
  const wsPath = resolve(rootDir, 'pnpm-workspace.yaml');
  const src = readFileSync(wsPath, 'utf8');
  const memberLine = `  - ${pkgDirRel}`;
  if (src.includes(`${memberLine}\n`)) {
    wired.push('pnpm-workspace.yaml (already present)');
  } else {
    const updated = insertBefore(src, '  - packages/create-exo-app', [memberLine]);
    writeFileSync(wsPath, updated, 'utf8');
    wired.push('pnpm-workspace.yaml (packages)');
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const out = process.stdout;
out.write(`\nScaffolded ${pkgName} (${register ? 'register' : 'library'}${deps.length ? `, deps: ${deps.join(', ')}` : ''}) @ v${coreVersion}\n\n`);

out.write('Generated files:\n');
for (const f of generated) out.write(`  + ${f}\n`);

out.write('\nAuto-wired (single sources of truth):\n');
for (const w of wired) out.write(`  ✓ ${w}\n`);

const filterFlag = `--filter "${pkgName}"`;
out.write(`
Next: run \`pnpm install\` to link the new workspace package, then \`pnpm ${filterFlag} typecheck\`.

────────────────────────────────────────────────────────────────────────────────
MANUAL CHECKLIST — not auto-edited (enumerated YAML / different runtime / npm bootstrap)
────────────────────────────────────────────────────────────────────────────────

1) vitest.config.ts — add a jsdom test project (after the other extension projects):

     createJsdomTestProject({
       name: 'exojs-${name}',
       alias: aliasConfig,
       include: ['${pkgDirRel}/test/**/*.test.ts'],
     }),

   If other in-repo tests import this package's source, also add to \`aliasConfig\`:

     { find: '${pkgName}', replacement: fileURLToPath(new URL('./${pkgDirRel}/src/index.ts', import.meta.url)) },

2) Root package.json scripts — append ${filterFlag} / --project=exojs-${name}:
     - "typecheck:packages"  → add ${filterFlag}
     - "test", "test:coverage" → add --project=exojs-${name}  (to run its tests by default)
     - "verify:publint"      → add ${filterFlag}  (only if you want publint to gate it)

3) .github/workflows/_ci-checks.yml — add ${filterFlag} to these three steps:
     - "Typecheck extension packages"
     - "Build extension packages"
     - "Extension package dry runs"

4) .github/workflows/release.yml — add this build line to the PREPARE job
   (verify:release-matrix ENFORCES it, so a forgotten line fails CI):

     pnpm --filter ${pkgName} build
${
  deps.length
    ? `
   Runtime deps build first, so place it AFTER: ${deps.map(d => `pnpm --filter @codexo/exojs-${d} build`).join(', ')}.`
    : ''
}${
  deps.filter(d => d !== 'tilemap').length
    ? `
5) packages/exojs-config/rollup/index.js — add a \`corePaths\` declaration entry for
   each non-tilemap runtime dep so the build's .d.ts emit resolves it:
${deps
  .filter(d => d !== 'tilemap')
  .map(d => `     '@codexo/exojs-${d}': ['../exojs-${d}/dist/esm/index.d.ts'],`)
  .join('\n')}
`
    : ''
}
${deps.filter(d => d !== 'tilemap').length ? '6' : '5'}) npm / OIDC bootstrap BEFORE the first release (see scripts/release/RELEASING.md
   "Adding a NEW package to the lockstep set"):
     - Publish a one-off placeholder manually (e.g. ${coreVersion}-next.0 via \`npm login\` + \`npm publish\`).
       Trusted Publishing (OIDC) cannot publish a package that does not yet exist on npm.
     - Create its Trusted Publisher config on npmjs.com: repo Exoridus/ExoJS,
       workflow release.yml, no environment, enable the "publish" action.
     - The generated package.json already carries the required \`repository.directory\`
       field (npm publish --provenance / verify:release-matrix require it).
────────────────────────────────────────────────────────────────────────────────
`);
