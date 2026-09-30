/**
 * Fails when a published `.d.ts` does not carry the type semantics the source
 * declares.
 *
 * Every other type check in this repository reads the *source*. That cannot see a
 * defect that only exists in the emitted declarations - the declaration emitter
 * is allowed to drop a type, and the source keeps working while every consumer
 * breaks. This gate closes that gap by compiling real consumer programs against
 * the built declarations the way a consumer resolves them: through the package
 * `exports` map, with no source alias and no `customConditions` shortcut.
 *
 * The contracts live next to this script and are ordinary TypeScript, not
 * fixtures written in the DSL of a test framework, because the thing under test
 * is a compiler's accept/reject decision.
 *
 * Each contract is compiled twice per compiler and has to agree: the positive
 * file must compile clean, and every `@ts-expect-error` in the negative file
 * must really be an error. A surface that accepts everything fails the negative
 * file, a surface that rejects everything fails the positive one - together they
 * pin the conditional arity rather than merely checking that inference returns
 * something.
 *
 * Runs against the built `dist` trees, so they have to exist and be current; a
 * tree older than its own source is refused rather than judged.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const CONTRACTS = join(import.meta.dirname, 'declaration-semantics');

/**
 * Compilers the contracts are checked against, from the repository's own
 * installed toolchain rather than a registry. `typescript` is the TypeScript 6
 * JavaScript compiler; the native one is reached through its package path. The
 * pair covers the API compiler that ships and the native compiler that now
 * builds, so a change to either can be caught here.
 */
const compilers = (): { label: string; bin: string }[] => {
  const require = createRequire(join(REPO_ROOT, 'package.json'));
  const out: { label: string; bin: string }[] = [];

  const apiManifest = require.resolve('typescript/package.json');
  out.push({ label: 'TypeScript 6 (JavaScript compiler)', bin: join(join(apiManifest, '..'), 'bin', 'tsc') });

  const nativeManifest = require.resolve('@typescript/native/package.json');
  out.push({ label: 'TypeScript 7 (native compiler)', bin: join(join(nativeManifest, '..'), 'bin', 'tsc') });

  return out;
};

const newestMtime = (dir: string): number => {
  if (!existsSync(dir)) return 0;

  let newest = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }

  return newest;
};

const DIST = join(REPO_ROOT, 'dist');
const SRC = join(REPO_ROOT, 'src');

if (!existsSync(join(DIST, 'esm', 'index.d.ts'))) {
  console.error('verify:declaration-semantics: no built core declarations found. Run `pnpm build` first.');
  process.exit(1);
}

// Local only: on CI the tree arrives as a build artifact, so freshness is a
// property of the pipeline rather than of the file times an artifact download
// carries over from its upload.
if (!process.env.CI && newestMtime(DIST) < newestMtime(SRC)) {
  console.error(
    [
      'verify:declaration-semantics: the core dist tree is older than its source.',
      '',
      'The declarations these would be judged against are not the ones this source emits.',
      'Rebuild with `pnpm build` first.',
    ].join('\n'),
  );
  process.exit(1);
}

const workspace = mkdtempSync(join(tmpdir(), 'exo-declaration-semantics-'));

try {
  // Install the built tree as a real dependency so resolution goes through the
  // `exports` map. Copying rather than packing keeps the gate fast; what matters
  // is that the consumer cannot see a source file.
  const target = join(workspace, 'node_modules', '@codexo', 'exojs');
  cpSync(DIST, join(target, 'dist'), { recursive: true });
  cpSync(join(REPO_ROOT, 'package.json'), join(target, 'package.json'));
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'declaration-semantics-consumer', private: true, version: '0.0.0' }, null, 2));

  for (const file of ['fixtures.ts', 'positive.ts', 'negative.ts', 'inference.ts']) {
    cpSync(join(CONTRACTS, file), join(workspace, file));
  }

  // The consumer profile: what a plain Vite project gets, deliberately without
  // the repository's own compiler strictness. A contract that only holds under
  // stricter settings than a template uses would not be a contract a template
  // could rely on.
  writeFileSync(
    join(workspace, 'tsconfig.base.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
      },
      null,
      2,
    ),
  );

  const contracts = ['positive', 'negative', 'inference'] as const;
  for (const name of contracts) {
    writeFileSync(join(workspace, `tsconfig.${name}.json`), JSON.stringify({ extends: './tsconfig.base.json', files: [`${name}.ts`] }, null, 2));
  }

  const run = (bin: string, config: string): { code: number; out: string } => {
    const r = spawnSync(process.execPath, [bin, '--noEmit', '-p', join(workspace, config)], { encoding: 'utf8', cwd: workspace });
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };

  let failed = false;

  for (const compiler of compilers()) {
    console.log(`\n${compiler.label}`);

    for (const name of contracts) {
      const result = run(compiler.bin, `tsconfig.${name}.json`);
      const ok = result.code === 0;
      if (!ok) failed = true;

      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}.ts`);
      if (!ok) {
        for (const line of result.out
          .split(/\r?\n/)
          .filter(line => line.includes('error TS'))
          .slice(0, 10)) {
          console.log(`       ${line.trim()}`);
        }
      }
    }
  }

  if (failed) {
    console.error(
      [
        '',
        'verify:declaration-semantics: the shipped declarations do not carry the type semantics the source declares.',
        '',
        'The source compiles, so every source-only check passes; a consumer of this package does not.',
        'The usual cause is a type the declaration emitter drops on the way out - a `private` member is',
        'emitted without its declared type, which removes a generic parameter from the class shape and',
        'breaks inference that depends on it. Compare the two surfaces before changing anything:',
        '',
        '    pnpm build                       # emit from current source',
        '    grep "private" dist/esm/**/*.d.ts  # what actually ships',
        '',
        'Any change to a public generic contract needs a contract here, not only a source type test.',
      ].join('\n'),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `\nverify:declaration-semantics: ${contracts.length} contract file(s) hold against the built declarations, for ${compilers().length} compiler(s).`,
    );
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
