// Bridges the standalone `competitors/node_modules` (installed on demand, out of the
// pnpm workspace) into `../node_modules` so the bench adapters' plain `import 'pixi.js'`
// (etc.) resolve exactly as if it were a normal devDependency, with zero source changes.
//
// Uses a Windows junction (falls back to an ordinary symlink on POSIX, where the `type`
// argument is ignored) so it works without elevated privileges / Developer Mode.
//
// Run via `pnpm --filter @codexo/exojs-bench bench:setup` -- never by a plain install.
//
// Imports nothing but `node:` built-ins, so it type-checks and runs without the
// competitor install it exists to create. It is a member of the root
// tsconfig.scripts.json program for that reason; node strips its types, so keep
// the syntax erasable.
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const competitorsNodeModules = fileURLToPath(new URL('./node_modules/', import.meta.url));
const benchNodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> };
const names = Object.keys(pkg.dependencies ?? {});

if (names.length === 0) {
  console.log('[bench:setup] competitors/package.json has no dependencies -- nothing to link.');
  process.exit(0);
}

for (const name of names) {
  const target = resolve(competitorsNodeModules, name);
  const link = resolve(benchNodeModules, name);

  // A directory existing is insufficient: a broken pnpm layout may produce a
  // junction to an empty folder and still print "linked" successfully.
  if (!existsSync(resolve(target, 'package.json'))) {
    console.error(`[bench:setup] Invalid package installation: ${target} has no readable package.json for ${name}.`);
    process.exitCode = 1;
    continue;
  }

  mkdirSync(dirname(link), { recursive: true });
  rmSync(link, { recursive: true, force: true });
  symlinkSync(target, link, 'junction');

  if (!existsSync(resolve(link, 'package.json'))) {
    console.error(`[bench:setup] Broken junction for ${name}: ${link} -> ${target} (package.json could not be opened).`);
    process.exitCode = 1;
    continue;
  }

  console.log(`[bench:setup] verified ${name}: ${link} -> ${target}`);
}
