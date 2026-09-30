import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { GATE_GROUPS } from './gate-groups.ts';
import { CHECKED_README_PATHS } from './select-lanes.ts';

const ALL_GATES = Object.values(GATE_GROUPS).flat();
const ALL_BROWSER = ['webgl', 'webgpu', 'audio', 'tilemap'] as const;
const CORE_GATES = ['typecheck', 'typecheck:test', 'typecheck:workers', 'lint', 'lint:source-hygiene', 'lint:file-symbols', 'format:check', 'docs:api:check'];
const PACKAGE_GATES = ['lint', 'lint:source-hygiene', 'lint:file-symbols', 'format:check', 'docs:api:check'];
const SITE_GATES = ['typecheck:site', 'typecheck:site-scripts', 'lint:site', 'format:check'];
const CORE_WITHOUT_BROWSER = new Set(['src/math/Random.ts', 'src/input/gamepadMappings.ts', 'src/input/keyboardCodes.ts', 'src/input/gamepadDefinitions.ts']);

export interface LocalPolicy {
  gates: string[];
  packageTypechecks: string[];
  unitProjects: string[];
  unitFilter?: string;
  fullUnit: boolean;
  browser: string[];
  smoke: boolean;
  bench: boolean;
  allocation: boolean;
  physicsPerf: boolean;
  needsDist: boolean;
}

interface PackageManifest {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const packages = (): PackageManifest[] =>
  readdirSync(resolve('packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => {
      try {
        return [JSON.parse(readFileSync(resolve('packages', entry.name, 'package.json'), 'utf8')) as PackageManifest];
      } catch {
        return [];
      }
    });

const affectedPackages = (name: string): PackageManifest[] => {
  const manifests = packages();
  const selected = new Set([name]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const manifest of manifests) {
      if (selected.has(manifest.name)) continue;
      const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
      if (Object.keys(dependencies).some(dependency => selected.has(dependency))) {
        selected.add(manifest.name);
        changed = true;
      }
    }
  }
  return manifests.filter(manifest => selected.has(manifest.name));
};

const hasUnitProject = (manifest: PackageManifest): boolean =>
  manifest.name.startsWith('@codexo/exojs-') && existsSync(resolve('packages', manifest.name.slice('@codexo/'.length), 'test'));

const isGlobal = (file: string): boolean =>
  file === 'package.json' ||
  file === 'pnpm-lock.yaml' ||
  file === 'pnpm-workspace.yaml' ||
  file === 'vitest.config.ts' ||
  file.startsWith('scripts/ci/') ||
  file.startsWith('.github/workflows/') ||
  file.startsWith('packages/exojs-config/') ||
  /^tsconfig\..*\.json$/.test(file);

const emptyPolicy = (): LocalPolicy => ({
  gates: [],
  packageTypechecks: [],
  unitProjects: [],
  fullUnit: false,
  browser: [],
  smoke: false,
  bench: false,
  allocation: false,
  physicsPerf: false,
  needsDist: false,
});

/** Local pre-push selection. Unknown files take the complete policy; CI keeps its own authoritative matrix. */
export const selectLocalPolicy = (changedFiles: readonly string[]): LocalPolicy => {
  const files = changedFiles.map(file => String(file).replaceAll('\\', '/').trim()).filter(Boolean);
  const policy = emptyPolicy();
  const gates = new Set<string>();
  const projects = new Set<string>();
  const browsers = new Set<string>();
  const typechecks = new Set<string>();
  let broad = files.length === 0;
  let siteOnlyUnits = true;
  const add = (...names: string[]): void => {
    for (const name of names) gates.add(name);
  };

  for (const file of files) {
    if (isGlobal(file)) {
      broad = true;
      continue;
    }
    if (file === 'README.md' || CHECKED_README_PATHS.includes(file)) {
      add('format:check');
      projects.add('exojs');
    } else if (/\.mdx?$/.test(file) || /(^|\/)LICENSE$/.test(file)) {
      add('format:check');
      if (file.startsWith('site/src/content/')) {
        add('typecheck:guides', 'typecheck:site');
        add('format:check');
        projects.add('exojs');
        policy.needsDist = true;
      }
    } else if (file.startsWith('src/')) {
      siteOnlyUnits = false;
      add(...CORE_GATES);
      projects.add('exojs');
      if (/^src\/(index\.ts|renderer-sdk\.ts|extensions\/)/.test(file) || file.endsWith('/index.ts')) {
        add('typecheck:packages', 'full-bundle:exports:check');
        policy.needsDist = true;
        for (const manifest of packages()) if (hasUnitProject(manifest)) projects.add(manifest.name.slice('@codexo/'.length));
      }
      if (file.startsWith('src/rendering/') || file.startsWith('src/assets/')) {
        browsers.add('webgl');
        browsers.add('webgpu');
        policy.smoke = true;
        policy.needsDist = true;
        if (file.startsWith('src/rendering/')) {
          projects.add('rendering-perf');
          policy.allocation = true;
          policy.bench = true;
        }
      } else if (!CORE_WITHOUT_BROWSER.has(file)) {
        browsers.add('webgl');
        browsers.add('webgpu');
        policy.smoke = true;
        policy.needsDist = true;
      }
    } else if (file.startsWith('packages/')) {
      siteOnlyUnits = false;
      const packageDirectory = file.split('/')[1]!;
      let manifest: PackageManifest;
      try {
        manifest = JSON.parse(readFileSync(resolve('packages', packageDirectory, 'package.json'), 'utf8')) as PackageManifest;
      } catch {
        broad = true;
        continue;
      }
      add(...PACKAGE_GATES);
      for (const affected of affectedPackages(manifest.name)) {
        if (affected.scripts?.typecheck && affected.name !== '@codexo/exojs-bench') typechecks.add(affected.name);
        if (hasUnitProject(affected)) projects.add(affected.name.slice('@codexo/'.length));
      }
      if (
        packageDirectory === 'exojs-particles' ||
        packageDirectory === 'exojs-tilemap' ||
        packageDirectory === 'exojs-tiled' ||
        packageDirectory === 'exojs-lighting'
      ) {
        browsers.add('webgl');
        browsers.add('webgpu');
        policy.smoke = true;
        policy.needsDist = true;
      }
      if (packageDirectory === 'exojs-particles') policy.bench = true;
      if (packageDirectory === 'exojs-audio-fx') browsers.add('audio');
      if (packageDirectory === 'exojs-tilemap') browsers.add('tilemap');
      if (packageDirectory === 'exojs-physics') policy.physicsPerf = true;
    } else if (file.startsWith('examples/')) {
      add('typecheck:examples', 'examples:sync:check', 'assets:compact:check', ...SITE_GATES);
      projects.add('exojs');
      policy.smoke = true;
      policy.needsDist = true;
    } else if (file.startsWith('site/')) {
      add(...SITE_GATES);
      policy.needsDist = true;
      if (file.startsWith('site/src/content/')) {
        add('typecheck:guides');
        projects.add('exojs');
      }
      if (file.startsWith('site/src/lib/')) projects.add('exojs');
      if (file.startsWith('site/src/pages/') || file.startsWith('site/src/components/') || file === 'site/scripts/smoke-examples.ts') policy.smoke = true;
    } else if (file.startsWith('test/')) {
      siteOnlyUnits = false;
      add('typecheck:test', 'lint', 'format:check');
      projects.add('exojs');
      if (file.startsWith('test/rendering/')) {
        browsers.add('webgl');
        browsers.add('webgpu');
      }
    } else {
      broad = true;
    }
  }

  if (broad)
    return {
      gates: [...ALL_GATES],
      packageTypechecks: [],
      unitProjects: [],
      fullUnit: true,
      browser: [...ALL_BROWSER],
      smoke: true,
      bench: true,
      allocation: true,
      physicsPerf: true,
      needsDist: true,
    };
  policy.gates = [...ALL_GATES.filter(name => gates.has(name)), ...[...gates].filter(name => !ALL_GATES.includes(name))];
  policy.packageTypechecks = [...typechecks].sort();
  policy.unitProjects = [...projects].sort();
  if (siteOnlyUnits && policy.unitProjects.length === 1 && policy.unitProjects[0] === 'exojs') policy.unitFilter = 'test/site';
  policy.browser = [...browsers];
  return policy;
};

export const changedFilesBetween = (base: string, head: string): string[] =>
  execFileSync('git', ['diff', '--name-only', `${base}..${head}`], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [option, ...args] = process.argv.slice(2);
  if (option === '--files') {
    process.stdout.write(`${JSON.stringify(selectLocalPolicy(args), null, 2)}\n`);
  } else if (option === '--needs-dist') {
    const [base, head] = args;
    try {
      process.stdout.write(`${selectLocalPolicy(base && head ? changedFilesBetween(base, head) : []).needsDist}\n`);
    } catch {
      process.stdout.write('true\n');
    }
  } else {
    throw new Error('Usage: node scripts/ci/local-policy.ts --files <paths...> | --needs-dist <base> <head>');
  }
}
