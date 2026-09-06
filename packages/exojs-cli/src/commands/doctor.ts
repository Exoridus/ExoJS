import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { type OptionSpec, parseArgs } from '../args.js';
import { type BrowserTarget, evaluateBrowserTargets } from '../browserTargets.js';
import { CliError } from '../CliError.js';

export const DOCTOR_USAGE = `Usage: exo doctor [dir]

Check whether an installed ExoJS project can run what it asks for: the Node
version the engine wants, a single package manager, one version line across the
engine and its extensions, and browser targets that can reach WebGL2 and WebGPU.

Arguments:
  dir                  Project directory (default: the current directory)`;

const OPTIONS: OptionSpec = new Map();

/** Packages published off the engine's version line, and therefore not part of the lockstep check. */
const INDEPENDENT_PACKAGES = new Set(['@codexo/exojs-build', '@codexo/exojs-cli']);

interface Outcome {
  readonly ok: boolean;
  readonly detail: string;
  /** The command that turns a failed check green. */
  readonly fix?: string | undefined;
}

interface Check {
  readonly name: string;
  /** A failed required check exits non-zero; an optional one is reported and moves on. */
  readonly required: boolean;
  run(): Outcome;
}

interface ProjectManifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly packageManager?: string;
  readonly browserslist?: string[] | string | { readonly production?: string[] };
}

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

const DIGITS = /^\d+$/;

/**
 * Whether `version` satisfies the narrow range forms `devEngines` uses: `^24`,
 * `>=24`, `24.x` and a bare `24`. Anything else is reported as unevaluated by
 * the caller rather than guessed at.
 */
const satisfiesNodeRange = (range: string, version: string): boolean | null => {
  const trimmed = range.trim();
  let comparator = '';

  if (trimmed.startsWith('>=')) comparator = '>=';
  else if (trimmed.startsWith('^')) comparator = '^';

  const major = trimmed.slice(comparator.length).split('.')[0] ?? '';

  if (!DIGITS.test(major)) return null;

  const wanted = Number(major);
  const actual = Number(version.split('.')[0]);

  return comparator === '>=' ? actual >= wanted : actual === wanted;
};

const LOCKFILES = new Map<string, string>([
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
]);

/** Installed `@codexo/exojs*` packages on the engine's lockstep line, with their versions. */
const installedEnginePackages = (projectDir: string): Array<{ name: string; version: string }> => {
  const scopeDir = join(projectDir, 'node_modules', '@codexo');

  if (!existsSync(scopeDir)) return [];

  const found: Array<{ name: string; version: string }> = [];

  for (const entry of readdirSync(scopeDir)) {
    const name = `@codexo/${entry}`;

    if (!entry.startsWith('exojs') || INDEPENDENT_PACKAGES.has(name)) continue;

    const manifest = readJson<{ version?: string }>(join(scopeDir, entry, 'package.json'));

    if (manifest?.version !== undefined) found.push({ name, version: manifest.version });
  }

  return found;
};

const browserslistQueries = (projectDir: string, manifest: ProjectManifest): string[] => {
  const configPath = join(projectDir, '.browserslistrc');

  if (existsSync(configPath)) {
    return readFileSync(configPath, 'utf8').split(/\r?\n/);
  }

  const declared = manifest.browserslist;

  if (Array.isArray(declared)) return declared;
  if (typeof declared === 'string') return [declared];
  if (declared?.production) return declared.production;

  return [];
};

const buildChecks = (projectDir: string, manifest: ProjectManifest): Check[] => [
  {
    name: 'node',
    required: true,
    run: () => {
      const enginePath = join(projectDir, 'node_modules', '@codexo', 'exojs', 'package.json');
      const engine = readJson<{ devEngines?: { runtime?: { version?: string } } }>(enginePath);
      const range = engine?.devEngines?.runtime?.version;
      const actual = process.versions.node;

      if (range === undefined) {
        return { ok: true, detail: `v${actual} (@codexo/exojs declares no runtime range)` };
      }

      const satisfied = satisfiesNodeRange(range, actual);

      if (satisfied === null) {
        return { ok: true, detail: `v${actual} (cannot evaluate the declared range "${range}")` };
      }

      return {
        ok: satisfied,
        detail: `v${actual} (@codexo/exojs asks for ${range})`,
        fix: satisfied ? undefined : `install a Node matching ${range} - nvm use, fnm use or volta pin node@${range.replaceAll(/[^\d.]/g, '')}`,
      };
    },
  },
  {
    name: 'package manager',
    required: true,
    run: () => {
      const found = [...LOCKFILES].filter(([file]) => existsSync(join(projectDir, file)));
      const present = found.map(([file]) => file);
      const managers = [...new Set(found.map(([, manager]) => manager))];
      const [manager] = managers;
      const pinned = manifest.packageManager?.split('@')[0];

      if (manager === undefined) {
        return { ok: false, detail: 'no lockfile - installs are not reproducible', fix: `${pinned ?? 'npm'} install` };
      }

      if (managers.length > 1) {
        // Two lockfiles resolve to two different dependency trees, and which
        // one a machine gets depends on which command someone happened to run.
        return {
          ok: false,
          detail: `${present.join(' and ')} - two package managers own this project`,
          fix: `delete the lockfiles that do not belong to ${pinned ?? manager}`,
        };
      }

      if (pinned !== undefined && pinned !== manager) {
        return {
          ok: false,
          detail: `${present.join('')} present, but packageManager pins ${manifest.packageManager ?? pinned}`,
          fix: `run ${pinned} install, or change the packageManager field to ${manager}`,
        };
      }

      return { ok: true, detail: `${manager} (${present.join('')})` };
    },
  },
  {
    name: 'engine lockstep',
    required: true,
    run: () => {
      const installed = installedEnginePackages(projectDir);
      const core = installed.find(pkg => pkg.name === '@codexo/exojs');

      if (core === undefined) {
        return { ok: false, detail: '@codexo/exojs is not installed', fix: 'npm install' };
      }

      const line = (version: string): string => version.split('.').slice(0, 2).join('.');
      const expected = line(core.version);
      const strays = installed.filter(pkg => line(pkg.version) !== expected);

      if (strays.length > 0) {
        // Extensions build against Core's internals, so a mixed set fails at
        // runtime rather than at install time.
        return {
          ok: false,
          detail: `${core.name}@${core.version} vs ${strays.map(pkg => `${pkg.name}@${pkg.version}`).join(', ')}`,
          fix: `npm install ${strays.map(pkg => `${pkg.name}@${expected}`).join(' ')}`,
        };
      }

      return { ok: true, detail: `v${core.version} across ${installed.length} package(s)` };
    },
  },
  {
    name: 'browser targets',
    // A declared target the engine cannot render on at all is a project
    // misconfiguration, not an environment warning: the app will not run there.
    required: true,
    run: () => {
      const queries = browserslistQueries(projectDir, manifest);

      if (queries.length === 0) {
        return { ok: true, detail: 'none declared - add a "browserslist" field to have them checked' };
      }

      const { targets, unevaluated } = evaluateBrowserTargets(queries);
      const noWebgl2 = targets.filter(target => !target.webgl2);
      const noWebgpu = targets.filter(target => !target.webgpu);
      const describe = (list: readonly BrowserTarget[]): string => list.map(target => `${target.browser} ${target.version}`).join(', ');
      const notes = unevaluated.length > 0 ? ` (not evaluated: ${unevaluated.join(', ')})` : '';

      if (noWebgl2.length > 0) {
        return {
          ok: false,
          detail: `${describe(noWebgl2)} cannot run WebGL2, the engine's baseline backend${notes}`,
          fix: 'raise those targets, or drop them from the browserslist query',
        };
      }

      if (targets.length === 0) {
        return { ok: true, detail: `no target resolved without the browserslist database${notes}` };
      }

      const webgpu = noWebgpu.length === 0 ? 'WebGPU too' : `WebGPU falls back to WebGL2 on ${describe(noWebgpu)}`;

      return { ok: true, detail: `${targets.length} target(s) run WebGL2; ${webgpu}${notes}` };
    },
  },
];

/**
 * Report what an installed ExoJS project is missing, one line per check, with a
 * command for each failure.
 *
 * @returns `1` when a required check failed, `0` otherwise.
 */
export const runDoctor = (argv: readonly string[]): number => {
  const args = parseArgs(argv, OPTIONS);
  const projectDir = resolve(args.positionals[0] ?? '.');
  const manifest = readJson<ProjectManifest>(join(projectDir, 'package.json'));

  if (manifest === null) {
    throw new CliError(`no readable package.json in "${projectDir}"`, { hint: 'Run `exo doctor` from an ExoJS project, or pass its directory.' });
  }

  const dependsOnEngine = manifest.dependencies?.['@codexo/exojs'] !== undefined || manifest.devDependencies?.['@codexo/exojs'] !== undefined;

  if (!dependsOnEngine) {
    throw new CliError(`"${projectDir}" does not depend on @codexo/exojs`, {
      hint: 'Run `exo create` to scaffold a project, or `npm install @codexo/exojs` in an existing one.',
    });
  }

  console.log('doctor: prerequisites for this project\n');

  let failed = false;

  for (const check of buildChecks(projectDir, manifest)) {
    const outcome = check.run();
    const failure = check.required ? 'FAIL' : 'warn';
    const mark = outcome.ok ? 'ok  ' : failure;

    console.log(`  ${mark}  ${check.name.padEnd(16)} ${outcome.detail}`);

    if (outcome.fix !== undefined && !outcome.ok) console.log(`        fix: ${outcome.fix}`);
    if (!outcome.ok && check.required) failed = true;
  }

  console.log('');
  console.log(failed ? 'doctor: a required prerequisite is missing; see the fix lines above.' : 'doctor: this project is ready.');

  return failed ? 1 : 0;
};
