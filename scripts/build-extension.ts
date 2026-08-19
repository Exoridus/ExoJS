/**
 * Builds one official extension package: the `dist/esm` preserveModules tree
 * (with declarations). Invoked from inside the package directory (matching
 * the previous `rollup -c` convention): `tsx ../../scripts/build-extension.ts`.
 *
 * Bundling runs on Rolldown, reading the package-local `rolldown.config.ts`
 * for its `createExtensionBuildOptions(...)` job; declarations are a separate
 * `tsc --emitDeclarationOnly` pass against the package's `tsconfig.build.json`
 * (which overrides `paths` to point at Core's *built* declarations rather
 * than its source - see that file's comment).
 *
 * `--dev` selects the dev build (`build:dev`), without relying on a
 * cross-platform env-var-setting mechanism.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

import { rolldown, type OutputOptions, type RolldownOptions } from 'rolldown';

const cwd = process.cwd();
process.env.EXOJS_ENV = process.argv.includes('--dev') ? 'development' : 'production';

rmSync(resolvePath(cwd, 'dist'), { recursive: true, force: true });

const { default: options }: { default: RolldownOptions } = await import(pathToFileURL(resolvePath(cwd, 'rolldown.config.ts')).href);

const bundle = await rolldown(options);
await bundle.write(options.output as OutputOptions);
await bundle.close();

const buildTsconfig = resolvePath(cwd, 'tsconfig.build.json');
if (existsSync(buildTsconfig)) {
  const tsc = resolvePath(cwd, '../../node_modules/typescript/bin/tsc');
  const result = spawnSync(
    process.execPath,
    [
      tsc,
      '-p',
      'tsconfig.build.json',
      '--emitDeclarationOnly',
      '--outDir',
      'dist/esm',
      '--declarationDir',
      'dist/esm',
      '--inlineSources',
      '--incremental',
      'false',
    ],
    { cwd, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(`declaration emit failed (tsc exit ${result.status})`);
  }
}
