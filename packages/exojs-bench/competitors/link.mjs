// Bridges the standalone `competitors/node_modules` (installed on demand, out of the
// pnpm workspace) into `../node_modules` so the bench adapters' plain `import 'pixi.js'`
// (etc.) resolve exactly as if it were a normal devDependency, with zero source changes.
//
// Uses a Windows junction (falls back to an ordinary symlink on POSIX, where the `type`
// argument is ignored) so it works without elevated privileges / Developer Mode.
//
// Run via `pnpm --filter @codexo/exojs-bench bench:setup` -- never by a plain install.
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const competitorsDir = fileURLToPath(new URL('.', import.meta.url));
const benchNodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const names = Object.keys(pkg.dependencies ?? {});

if (names.length === 0) {
  console.log('[bench:setup] competitors/package.json has no dependencies -- nothing to link.');
  process.exit(0);
}

for (const name of names) {
  const target = `${competitorsDir}node_modules/${name}`;
  const link = `${benchNodeModules}${name}`;

  if (!existsSync(target)) {
    console.error(`[bench:setup] ${name} was not installed into competitors/node_modules -- did the install step fail?`);
    process.exitCode = 1;
    continue;
  }

  mkdirSync(dirname(link), { recursive: true });
  rmSync(link, { recursive: true, force: true });
  symlinkSync(target, link, 'junction');
  console.log(`[bench:setup] linked ${name} -> competitors/node_modules/${name}`);
}
