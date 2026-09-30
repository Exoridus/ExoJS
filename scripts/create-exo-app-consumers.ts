/**
 * Real consumer verification for the scaffolder: builds each generated project
 * against the *shipped* packages rather than the workspace sources.
 *
 * Everything else this script checks reads the repository. A template can satisfy
 * every structural rule, type-check against the engine's sources, and still fail
 * for a user, because the user installs a package and resolves its declarations -
 * a different surface. That gap is not hypothetical: a scene's activation-data
 * inference was correct in the source and broken in the emitted declarations, and
 * only a consumer compiling against the built package could see it.
 *
 * The six projects share one pnpm workspace so they install once. `tsc` and
 * `vite build` then run separately per project and both outcomes are recorded: a
 * type error that stops a combined `pnpm build` would hide the bundler result,
 * and the two fail for unrelated reasons.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Packages a template may depend on, mapped to the workspace directory that builds it. */
const PACKAGE_SOURCES: Record<string, string> = {
  '@codexo/exojs': '.',
  '@codexo/exojs-audio-fx': 'packages/exojs-audio-fx',
  '@codexo/exojs-aseprite': 'packages/exojs-aseprite',
  '@codexo/exojs-ldtk': 'packages/exojs-ldtk',
  '@codexo/exojs-lighting': 'packages/exojs-lighting',
  '@codexo/exojs-particles': 'packages/exojs-particles',
  '@codexo/exojs-pathfinding': 'packages/exojs-pathfinding',
  '@codexo/exojs-physics': 'packages/exojs-physics',
  '@codexo/exojs-tilemap': 'packages/exojs-tilemap',
  '@codexo/exojs-tilemap-physics': 'packages/exojs-tilemap-physics',
  '@codexo/exojs-tiled': 'packages/exojs-tiled',
};

export interface ConsumerOutcome {
  readonly template: string;
  /** `tsc --noEmit` against the installed package's declarations. */
  readonly typecheck: { readonly ok: boolean; readonly detail: string };
  /** `vite build`, the production bundle a user would ship. */
  readonly bundle: { readonly ok: boolean; readonly detail: string };
  readonly viteVersion: string;
  readonly typescriptVersion: string;
}

const run = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): { code: number; out: string } => {
  // On Windows the package managers are `.cmd` shims that cannot be spawned
  // directly, and a `.cmd` shim in turn cannot take a shell without re-splitting
  // arguments that contain spaces. Resolve to the shim, and shell only for it.
  const needsShell = process.platform === 'win32';
  const executable = needsShell ? `${command}.cmd` : command;
  try {
    const out = execFileSync(executable, args, { cwd, encoding: 'utf8', stdio: 'pipe', shell: needsShell, env: { ...process.env, ...env } });
    return { code: 0, out };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const tail = (out: string, lines = 4): string =>
  out
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .slice(-lines)
    .join('\n');

/** Runs the install-and-build contract for every generated project. */
export const verifyRealConsumers = (options: {
  readonly repoRoot: string;
  readonly workspace: string;
  readonly templates: readonly string[];
  readonly runScaffold: (template: string, destination: string) => void;
  readonly report: (outcome: ConsumerOutcome) => void;
}): readonly ConsumerOutcome[] => {
  const { repoRoot, workspace, templates, runScaffold, report } = options;

  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });

  // A shared workspace: one store, one resolution pass, six consumers.
  writeFileSync(join(workspace, 'pnpm-workspace.yaml'), ['packages:', '  - "*"', ''].join('\n'));
  writeFileSync(join(workspace, 'package.json'), `${JSON.stringify({ name: 'create-exo-app-consumers', private: true, version: '0.0.0' }, null, 2)}\n`);

  // Scaffold first, so the set of packages to pack comes from what the templates
  // actually declare. Packing is the dominant cost of this step - measurably more
  // than the twelve compile and bundle commands combined - so a template that
  // does not depend on an extension package must not cost one.
  //
  // A scaffold failure is reported per template and the rest still run: the
  // structural checks in the caller already cover a broken scaffolder, and here
  // the value of the remaining templates is in what they *do* reveal.
  const scaffoldFailures = new Map<string, string>();
  for (const template of templates) {
    try {
      runScaffold(template, join(workspace, template));
    } catch (error) {
      scaffoldFailures.set(template, error instanceof Error ? error.message : String(error));
    }
  }

  const required = new Set<string>();
  for (const template of templates) {
    if (scaffoldFailures.has(template)) continue;
    const manifest = JSON.parse(readFileSync(join(workspace, template, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const bucket of [manifest.dependencies, manifest.devDependencies]) {
      for (const [name] of Object.entries(bucket ?? {})) {
        if (name in PACKAGE_SOURCES) required.add(name);
      }
    }
  }

  // A package that is needed but not built is reported rather than skipped, so a
  // missing build cannot look like a template that happens not to need it.
  const tarballDir = join(workspace, '.tarballs');
  mkdirSync(tarballDir, { recursive: true });

  const packed = new Map<string, string>();
  for (const name of required) {
    const dir = PACKAGE_SOURCES[name]!;
    if (!existsSync(join(repoRoot, dir, 'dist'))) {
      throw new Error(`${name} is required by a template but has no built dist. Run \`pnpm build\` and \`pnpm build:packages\` first.`);
    }

    // Pack from inside the package directory. `npm pack <path>` resolves the
    // argument as a package specifier, which for a workspace directory falls
    // through to the registry and fails on a name that is not published.
    const result = run('npm', ['pack', '--pack-destination', tarballDir, '--silent'], join(repoRoot, dir));
    if (result.code !== 0) throw new Error(`npm pack failed for ${name}:\n${tail(result.out, 6)}`);

    // npm names the archive after the package with the scope flattened:
    // `@codexo/exojs-physics` 0.18.0 -> `codexo-exojs-physics-0.18.0.tgz`.
    const prefix = `${name.replace('@', '').replace(/\//g, '-')}-`;
    const archive = readdirSync(tarballDir).find(entry => entry.startsWith(prefix) && entry.endsWith('.tgz'));
    if (!archive) throw new Error(`npm pack produced no ${prefix}*.tgz for ${name}`);
    packed.set(name, `file:${join(tarballDir, archive).replaceAll('\\', '/')}`);
  }

  const outcomes: ConsumerOutcome[] = [];

  for (const template of templates) {
    const dir = join(workspace, template);
    // Assigned in both branches below; the initialisers only give the catch block
    // something to report when scaffolding or installing fails before either runs.
    let typecheck: { ok: boolean; detail: string };
    let bundle: { ok: boolean; detail: string };
    let viteVersion = 'unknown';
    let typescriptVersion = 'unknown';

    try {
      if (scaffoldFailures.has(template)) throw new Error(scaffoldFailures.get(template));

      // Point the generated project at the packed packages of this tree, so the
      // check proves what a consumer of the *next* release gets. Templates use the
      // `latest` dist-tag by design; here that would silently test the published
      // release instead of the code under review.
      const manifestPath = join(dir, 'package.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const bucket of [manifest.dependencies, manifest.devDependencies]) {
        for (const [name] of Object.entries(bucket ?? {})) {
          const tarball = packed.get(name);
          if (tarball) bucket![name] = tarball;
        }
      }
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      // `--reporter=append-only` rather than `silent`: a silent reporter also
      // suppresses the error output, so a failing install would report nothing
      // but a non-zero exit. The progress lines are noise, the diagnosis is not.
      const install = run('pnpm', ['install', '--ignore-scripts', '--reporter=append-only'], workspace);
      if (install.code !== 0) throw new Error(`install failed:\n${tail(install.out, 12)}`);

      const versionOf = (pkg: string): string => {
        const manifestFile = join(dir, 'node_modules', pkg, 'package.json');
        if (!existsSync(manifestFile)) return 'missing';
        return (JSON.parse(readFileSync(manifestFile, 'utf8')) as { version: string }).version;
      };
      viteVersion = versionOf('vite');
      typescriptVersion = versionOf('typescript');

      // The two contracts are independent: a type error must not stop the
      // bundler from running, or one failure would mask the other.
      const typecheckResult = run('pnpm', ['exec', 'tsc', '--noEmit'], dir);
      typecheck = { ok: typecheckResult.code === 0, detail: typecheckResult.code === 0 ? '' : tail(typecheckResult.out, 6) };

      const bundleResult = run('pnpm', ['exec', 'vite', 'build'], dir);
      const produced = existsSync(join(dir, 'dist'));
      bundle = {
        ok: bundleResult.code === 0 && produced,
        detail: bundleResult.code === 0 ? (produced ? '' : 'build reported success but produced no dist/') : tail(bundleResult.out, 6),
      };
    } catch (error) {
      // A failure before either command ran - scaffolding, rewriting the
      // manifest or installing - is reported against both, since neither was
      // reached and neither can be assumed to pass.
      const message = error instanceof Error ? error.message : String(error);
      typecheck = { ok: false, detail: message };
      bundle = { ok: false, detail: message };
    }

    const outcome: ConsumerOutcome = { template, typecheck, bundle, viteVersion, typescriptVersion };
    outcomes.push(outcome);
    report(outcome);
  }

  return outcomes;
};
