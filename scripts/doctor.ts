/**
 * One screen that says whether this clone can run what the repository asks of
 * it, and names the command for whatever cannot.
 *
 * Every check here corresponds to a failure that has cost a diagnosis before:
 * a Node version the tooling silently tolerated, git hooks that never fired
 * because the install skipped `prepare`, a stale dist that made the site
 * render a black canvas, a benchmark that could not find its competitor
 * libraries. Run it after `pnpm bootstrap:dev`, and whenever
 * something fails in a way that reads like a broken change but smells like a
 * missing prerequisite.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { BUILD_CACHES, formatBytes, presentArtifacts, RUN_ARTIFACTS } from './artifacts.ts';
import { checkFreshness, REBUILD_COMMAND, repoRoot } from './dist-freshness.ts';

interface Outcome {
  readonly ok: boolean;
  readonly detail: string;
  /** The command that turns a failed check green. */
  readonly fix?: string;
}

interface Check {
  readonly name: string;
  /** A failed required check exits non-zero; an optional one is reported and moves on. */
  readonly required: boolean;
  run(): Outcome;
}

const read = (relativePath: string): string => readFileSync(join(repoRoot, relativePath), 'utf8');

const command = (file: string, args: readonly string[]): string | null => {
  try {
    return execFileSync(file, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    }).trim();
  } catch {
    return null;
  }
};

const packageJson = JSON.parse(read('package.json')) as { packageManager?: string };

const checks: Check[] = [
  {
    name: 'node',
    required: true,
    run: () => {
      // `.nvmrc` is the single source of the required major; `devEngines` in
      // package.json mirrors it for pnpm and a parity test keeps them equal.
      const wanted = read('.nvmrc').trim();
      const actual = process.versions.node;
      const ok = actual.split('.')[0] === wanted;

      return {
        ok,
        detail: `v${actual} (required: ${wanted}.x)`,
        fix: ok ? undefined : `install Node ${wanted} - nvm use, fnm use or volta pin node@${wanted}`,
      };
    },
  },
  {
    name: 'pnpm',
    required: true,
    run: () => {
      const pinned = packageJson.packageManager?.split('@')[1] ?? '?';
      const actual = command('pnpm', ['--version']);

      if (actual === null) {
        return { ok: false, detail: 'not found on PATH', fix: 'corepack enable, or install pnpm - it switches itself to the pinned version' };
      }

      return { ok: actual === pinned, detail: `${actual} (pinned: ${pinned})`, fix: actual === pinned ? undefined : 'corepack enable' };
    },
  },
  {
    name: 'git hooks',
    required: true,
    run: () => {
      // Whether a clone has hooks depends on how it was set up: `bootstrap`
      // installs with --ignore-scripts, which skips the `prepare` that
      // installs them, so they appear only when pnpm's own install ran first.
      // `bootstrap:dev` installs them outright; this reports what is there.
      const hooksPath = command('git', ['config', 'core.hooksPath']) ?? '';
      const installed = hooksPath.replace(/\\/g, '/').endsWith('.husky/_') && existsSync(join(repoRoot, '.husky', '_', 'h'));

      return {
        ok: installed,
        detail: installed ? 'installed' : 'not installed - the pre-commit and pre-push guards are not running',
        fix: installed ? undefined : 'pnpm exec husky',
      };
    },
  },
  {
    name: 'git pull.ff',
    required: false,
    run: () => {
      const value = command('git', ['config', 'pull.ff']);
      const ok = value === 'only';

      return {
        ok,
        detail: ok ? 'only' : `${value ?? 'unset'} - a pull on a diverged main/next would build a merge commit`,
        fix: ok ? undefined : 'git config pull.ff only',
      };
    },
  },
  {
    name: 'dist',
    required: true,
    run: () => {
      const report = checkFreshness();
      const problems = [...report.unbuilt.map(unit => `${unit.name} not built`), ...report.stale];

      if (problems.length === 0) return { ok: true, detail: `${report.units.length} build unit(s) current` };

      return { ok: false, detail: problems.join('; '), fix: REBUILD_COMMAND };
    },
  },
  {
    name: 'playwright chromium',
    required: false,
    run: () => {
      // The browser lanes, the example smoke and the benchmarks all launch it.
      // Resolved through the repository's own playwright dependency, so the
      // answer is about the build the tests will use, not a global install.
      const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { executablePath(): string } };
      const ok = existsSync(chromium.executablePath());

      return {
        ok,
        detail: ok ? 'installed' : 'not installed - browser tests, the example smoke and the benchmarks cannot run',
        fix: ok ? undefined : 'pnpm exec playwright install chromium',
      };
    },
  },
  {
    name: 'bench competitors',
    required: false,
    run: () => {
      const linked = existsSync(join(repoRoot, 'packages', 'exojs-bench', 'node_modules', 'pixi.js', 'package.json'));

      return {
        ok: linked,
        detail: linked ? 'linked' : 'not linked - the benchmark competitor arms and the bench typecheck cannot run',
        fix: linked ? undefined : 'pnpm bench:setup',
      };
    },
  },
  {
    name: 'naga',
    required: false,
    run: () => {
      const version = command('naga', ['--version']);

      return { ok: version !== null, detail: version ?? 'not on PATH - WGSL validation tests skip locally (CI installs it)' };
    },
  },
];

let failed = false;

console.log('doctor: prerequisites for this clone\n');

for (const check of checks) {
  const outcome = check.run();
  const mark = outcome.ok ? 'ok  ' : check.required ? 'FAIL' : 'warn';

  console.log(`  ${mark}  ${check.name.padEnd(20)} ${outcome.detail}`);

  if (!outcome.ok && outcome.fix !== undefined) console.log(`        fix: ${outcome.fix}`);
  if (!outcome.ok && check.required) failed = true;
}

const artifacts = presentArtifacts(repoRoot, RUN_ARTIFACTS);
const caches = presentArtifacts(repoRoot, BUILD_CACHES);
const sum = (items: readonly { bytes: number }[]): number => items.reduce((total, item) => total + item.bytes, 0);

if (artifacts.length > 0 || caches.length > 0) {
  console.log('');

  if (artifacts.length > 0) {
    console.log(`  info  run artifacts        ${formatBytes(sum(artifacts))} in ${artifacts.map(a => a.path).join(', ')} - pnpm clean:artifacts removes them`);
  }

  if (caches.length > 0) {
    console.log(`  info  build caches         ${formatBytes(sum(caches))} in ${caches.map(c => c.path).join(', ')} - pnpm clean:all removes these too`);
  }
}

console.log('');
console.log(failed ? 'doctor: a required prerequisite is missing; see the fix lines above.' : 'doctor: this clone is ready.');
process.exit(failed ? 1 : 0);
