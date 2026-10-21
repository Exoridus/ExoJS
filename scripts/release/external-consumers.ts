/**
 * External consumer smoke for the coordinated release.
 *
 * Installs the packed tarballs into a throwaway project OUTSIDE the
 * repository (so no workspace/source resolution can leak in) and proves they
 * work for the audiences a published release must serve:
 *
 *   - Node (ESM runtime): `import` each package and every Core subpath, and
 *     assert key exports exist and share one Core.
 *   - TypeScript / Vite (bundler resolution): type-check a consumer module with
 *     `moduleResolution: bundler` - exactly the resolution Vite/esbuild use -
 *     against the shipped `.d.ts`. Combined with `attw`'s `bundler 🟢` this is
 *     the Vite-consumer proof without needing Vite installed.
 *   - TypeScript under Node's own resolution (`NodeNext`), which reads the same
 *     `exports` map but requires every relative specifier in the shipped
 *     declarations to name a real file.
 *   - TypeScript subpath entries: one program per documented subpath that never
 *     imports the root barrel. A root-barrel import anywhere in the same
 *     program would pull in whatever ambient globals the root's `.d.ts` carries
 *     and mask a defect that only affects a consumer whose program never
 *     reaches it.
 *
 * Every TypeScript check is `strict`, with `skipLibCheck: false` and no
 * `paths`: the shipped declarations have to stand on their own.
 *
 * Fully offline: the runtime modules ship inside the Core tarball and the
 * adapters only peer on Core, so `npm install --offline` of the set resolves
 * with no registry access.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCKSTEP_PACKAGES, RUNTIME_MODULES } from './lockstep-packages.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// This is a *consumer* compiler, deliberately not the native TypeScript 7
// compiler that emits the shipped declarations. The point of the check is that a
// project on an ordinary TypeScript release can consume the published `.d.ts`,
// so it must keep running a mainstream JS-API compiler. Resolved from the
// installed manifest rather than a hard-coded `node_modules` path so the
// side-by-side native install cannot change which binary this reaches.
const consumerTscBin = resolve(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc');

export interface ConsumerCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

/** The Core subpaths a consumer can import, beyond the root entry. */
export const CORE_SUBPATHS: readonly string[] = [...RUNTIME_MODULES.map(module => module.subpath), 'debug', 'renderer-sdk'];

export const run = (command: string, args: string[], cwd: string): { code: number; output: string } => {
  try {
    const output = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    return { code: 0, output };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string; message?: string };

    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}` };
  }
};

const lastLines = (output: string, count: number): string => output.trim().split('\n').slice(-count).join(' ');

/**
 * Packs the package in `packageDir` into `destination` without running its
 * build scripts and returns the tarball path.
 */
export const packPackage = (packageDir: string, destination: string): string => {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { name: string; version: string };
  const r = run('pnpm', ['pack', '--pack-destination', destination, '--config.ignore-scripts=true'], packageDir);

  if (r.code !== 0) {
    throw new Error(`pack failed for ${packageDir}:\n${r.output}`);
  }

  const tarball = join(destination, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`);

  if (!existsSync(tarball)) {
    throw new Error(`pack of ${packageDir} produced no ${tarball}`);
  }

  return tarball;
};

/**
 * Creates a throwaway ESM project outside the repository with `tarballs`
 * installed offline. The caller removes the returned directory.
 */
export const createConsumerProject = (tarballs: readonly string[]): { dir: string; install: ConsumerCheck } => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-consumer-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'exo-external-consumer', private: true, type: 'module', version: '1.0.0' }, null, 2),
  );

  // `--no-save` keeps package.json clean; tarballs are passed positionally.
  const install = run('npm', ['install', '--no-audit', '--no-fund', '--offline', '--no-save', ...tarballs], dir);
  const ok = install.code === 0 && existsSync(join(dir, 'node_modules', '@codexo', 'exojs'));

  return {
    dir,
    install: { name: `install (offline, ${tarballs.length} tarballs)`, ok, ...(ok ? {} : { detail: lastLines(install.output, 3) }) },
  };
};

/** Runs `source` as an ES module in the consumer project and expects it to print `marker`. */
export const runNodeCheck = (dir: string, name: string, fileName: string, source: string, marker: string): ConsumerCheck => {
  writeFileSync(join(dir, fileName), source);
  const node = run('node', [fileName], dir);
  const ok = node.code === 0 && node.output.includes(marker);

  return { name, ok, ...(ok ? {} : { detail: lastLines(node.output, 5) }) };
};

export type ConsumerResolution = 'bundler' | 'nodenext';

const consumerTsconfig = (resolution: ConsumerResolution, include: string): string =>
  JSON.stringify(
    {
      compilerOptions: {
        module: resolution === 'bundler' ? 'esnext' : 'nodenext',
        moduleResolution: resolution,
        target: 'es2022',
        lib: ['es2022', 'dom', 'dom.iterable'],
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
      },
      include: [include],
    },
    null,
    2,
  );

/**
 * Type-checks `source` as its own program in the consumer project: strict, no
 * `paths`, no `skipLibCheck`, resolving the installed packages only through
 * their manifests.
 */
export const typecheckConsumer = (
  dir: string,
  name: string,
  baseName: string,
  source: string,
  resolution: ConsumerResolution,
): ConsumerCheck => {
  writeFileSync(join(dir, `${baseName}.ts`), source);
  writeFileSync(join(dir, `tsconfig.${baseName}.json`), consumerTsconfig(resolution, `${baseName}.ts`));
  const tsc = run('node', [consumerTscBin, '--noEmit', '-p', `tsconfig.${baseName}.json`], dir);

  return { name, ok: tsc.code === 0, ...(tsc.code === 0 ? {} : { detail: lastLines(tsc.output, 5) }) };
};

/** A program that reaches exactly one Core subpath and nothing else. */
export const subpathConsumerSource = (subpath: string): string =>
  `import * as entry from '@codexo/exojs/${subpath}';\n\nexport type Surface = typeof entry;\nexport const surface: Surface = entry;\n`;

const CONSUMER_TS = `import { ActionMap, Application, ButtonAction, Container, Keyboard, Scene } from '@codexo/exojs';
import { DebugLayer, DebugOverlay, PhysicsDebugDraw, type PhysicsDebugDrawOptions } from '@codexo/exojs/debug';
import { ParticleSystem, particlesExtension } from '@codexo/exojs/particles';
import { TileMap, tilemapExtension } from '@codexo/exojs/tilemap';
import { TiledMap, tiledExtension } from '@codexo/exojs-tiled';
import { PhysicsWorld } from '@codexo/exojs/physics';
import { AudioAnalyser, BeatDetector, ReverbEffect } from '@codexo/exojs/audio-fx';
import { AsepriteSheet, asepriteExtension } from '@codexo/exojs-aseprite';
import { LdtkMap, ldtkExtension } from '@codexo/exojs-ldtk';
import { TileColliderStreamer } from '@codexo/exojs/tilemap-physics';
import { Lighting, LitMaterial, PointLight } from '@codexo/exojs/lighting';
import { GridSpace, Pathfinder, WaypointGraph } from '@codexo/exojs/pathfinding';

export class DemoScene extends Scene {}

export function verifyCoreProtocols(container: Container): void {
    // ActionMap exposes its actions as named properties, not as an iterable —
    // unlike Container below, which does implement Symbol.iterator.
    const actions = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });
    void actions.jump.active;
    for (const child of container) void child;

    // The binding is constructed (and therefore owned) right here, not
    // accepted as a parameter — \`using\` disposes what this scope created,
    // mirroring \`InputSystem.onStart\`'s own "manual lifecycle" contract
    // rather than disposing a caller's binding out from under them.
    const app = new Application();
    using ownedBinding = app.input.onStart(Keyboard.Space, () => {});
    void ownedBinding.active;
}

export function physicsLayer(app: Application, world: PhysicsWorld, options: PhysicsDebugDrawOptions): DebugLayer {
    return new PhysicsDebugDraw(app, world, options);
}

export function bootstrap(): { app: Application; system: typeof ParticleSystem; tiles: typeof TileMap; map: typeof TiledMap } {
    const app = new Application();
    void particlesExtension;
    void tilemapExtension;
    void tiledExtension;
    void DebugOverlay;
    void AudioAnalyser;
    void BeatDetector;
    void ReverbEffect;
    void AsepriteSheet;
    void asepriteExtension;
    void LdtkMap;
    void ldtkExtension;
    void TileColliderStreamer;
    void Lighting;
    void LitMaterial;
    void PointLight;
    void GridSpace;
    void Pathfinder;
    void WaypointGraph;
    return { app, system: ParticleSystem, tiles: TileMap, map: TiledMap };
}
`;

/**
 * Core and every Core subpath in one program, with no adapter: the adapters'
 * own declarations are not part of the Core contract under Node's resolution.
 */
const namespaceFor = (subpath: string): string => `${subpath.replaceAll('-', '_')}Entry`;

export const CORE_CONSUMER_TS = `import { Application, Container } from '@codexo/exojs';
${CORE_SUBPATHS.map(subpath => `import * as ${namespaceFor(subpath)} from '@codexo/exojs/${subpath}';`).join('\n')}

export const entries = { ${CORE_SUBPATHS.map(namespaceFor).join(', ')} };

export function physicsLayer(app: Application, world: physicsEntry.PhysicsWorld): debugEntry.DebugLayer {
    return new debugEntry.PhysicsDebugDraw(app, world);
}

export function isNode(value: unknown): value is Container {
    return value instanceof Container;
}
`;

const NODE_SMOKE = `import * as exo from '@codexo/exojs';
import * as debug from '@codexo/exojs/debug';
import * as particles from '@codexo/exojs/particles';
import * as tilemap from '@codexo/exojs/tilemap';
import * as tiled from '@codexo/exojs-tiled';
import * as physics from '@codexo/exojs/physics';
import * as audioFx from '@codexo/exojs/audio-fx';
import * as aseprite from '@codexo/exojs-aseprite';
import * as ldtk from '@codexo/exojs-ldtk';
import * as tilemapPhysics from '@codexo/exojs/tilemap-physics';
import * as lighting from '@codexo/exojs/lighting';
import * as pathfinding from '@codexo/exojs/pathfinding';

const checks = [
  ['@codexo/exojs Application', typeof exo.Application === 'function'],
  ['@codexo/exojs Scene', typeof exo.Scene === 'function'],
  ['@codexo/exojs/debug DebugOverlay', typeof debug.DebugOverlay === 'function'],
  ['@codexo/exojs/debug PhysicsDebugDraw extends DebugLayer', Object.getPrototypeOf(debug.PhysicsDebugDraw) === debug.DebugLayer],
  ['@codexo/exojs/particles ParticleSystem', typeof particles.ParticleSystem === 'function'],
  ['@codexo/exojs/particles particlesExtension', particles.particlesExtension != null],
  ['@codexo/exojs/tilemap TileMap', typeof tilemap.TileMap === 'function'],
  ['@codexo/exojs/tilemap tilemapExtension', tilemap.tilemapExtension != null],
  ['@codexo/exojs-tiled TiledMap', typeof tiled.TiledMap === 'function'],
  ['@codexo/exojs-tiled tiledExtension', tiled.tiledExtension != null],
  ['facade TileMap identity (tiled === tilemap)', tiled.TileMap === tilemap.TileMap],
  ['@codexo/exojs/physics PhysicsWorld', typeof physics.PhysicsWorld === 'function'],
  ['@codexo/exojs/audio-fx AudioAnalyser', typeof audioFx.AudioAnalyser === 'function'],
  ['@codexo/exojs/audio-fx BeatDetector', typeof audioFx.BeatDetector === 'function'],
  ['@codexo/exojs/audio-fx ReverbEffect', typeof audioFx.ReverbEffect === 'function'],
  ['@codexo/exojs-aseprite AsepriteSheet', typeof aseprite.AsepriteSheet === 'function'],
  ['@codexo/exojs-aseprite asepriteExtension', aseprite.asepriteExtension != null],
  ['@codexo/exojs-ldtk LdtkMap', typeof ldtk.LdtkMap === 'function'],
  ['@codexo/exojs-ldtk ldtkExtension', ldtk.ldtkExtension != null],
  ['facade ldtk TileMap identity (ldtk === tilemap)', ldtk.TileMap === tilemap.TileMap],
  ['@codexo/exojs/tilemap-physics TileColliderStreamer', typeof tilemapPhysics.TileColliderStreamer === 'function'],
  ['@codexo/exojs/tilemap-physics buildObjectLayerColliders', typeof tilemapPhysics.buildObjectLayerColliders === 'function'],
  ['@codexo/exojs/lighting Lighting', typeof lighting.Lighting === 'function'],
  ['@codexo/exojs/lighting LitMaterial', typeof lighting.LitMaterial === 'function'],
  ['@codexo/exojs/lighting PointLight', typeof lighting.PointLight === 'function'],
  ['@codexo/exojs/pathfinding Pathfinder', typeof pathfinding.Pathfinder === 'function'],
  ['@codexo/exojs/pathfinding GridSpace', typeof pathfinding.GridSpace === 'function'],
  ['@codexo/exojs/pathfinding WaypointGraph', typeof pathfinding.WaypointGraph === 'function'],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length > 0) {
  console.error('MISSING:' + failed.join(','));
  process.exit(1);
}
console.log('NODE_OK ' + checks.length);
`;

/**
 * Runs the external-consumer checks against the packed tarball paths. Returns
 * one {@link ConsumerCheck} per audience; `ok` overall is the conjunction.
 */
export const verifyExternalConsumers = (tarballs: string[]): { ok: boolean; consumerDir: string; checks: ConsumerCheck[] } => {
  const { dir: consumerDir, install } = createConsumerProject(tarballs);
  const checks: ConsumerCheck[] = [install];

  try {
    if (!install.ok) {
      return { ok: false, consumerDir, checks };
    }

    checks.push(runNodeCheck(consumerDir, 'Node ESM import', 'node-smoke.mjs', NODE_SMOKE, 'NODE_OK'));
    checks.push(typecheckConsumer(consumerDir, 'TypeScript bundler-resolution type-check', 'consumer', CONSUMER_TS, 'bundler'));
    checks.push(
      typecheckConsumer(
        consumerDir,
        'TypeScript NodeNext-resolution type-check (Core and subpaths)',
        'consumer-core-node',
        CORE_CONSUMER_TS,
        'nodenext',
      ),
    );

    for (const resolution of ['bundler', 'nodenext'] as const) {
      for (const subpath of CORE_SUBPATHS) {
        const name = `TypeScript subpath-entry (${subpath}, ${resolution}) type-check`;
        checks.push(typecheckConsumer(consumerDir, name, `consumer-${resolution}-${subpath}`, subpathConsumerSource(subpath), resolution));
      }
    }

    return { ok: checks.every(c => c.ok), consumerDir, checks };
  } finally {
    rmSync(consumerDir, { recursive: true, force: true });
  }
};

// CLI: pack the official packages into a temp dir and run the checks.
if (import.meta.url.startsWith('file:') && fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const staging = mkdtempSync(join(tmpdir(), 'exo-cons-pack-'));
  // Offline-smoke subset (excludes @codexo/exojs-react - its react peers are not
  // resolvable offline). Derived from the single source of truth.
  const smokePackages = LOCKSTEP_PACKAGES.filter(p => p.inOfflineSmoke);
  let tarballs: string[];

  try {
    tarballs = smokePackages.map(p => packPackage(p.dir === '.' ? repoRoot : resolve(repoRoot, p.dir), staging));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write('\n=== verify:external-consumers ===\n');
  const result = verifyExternalConsumers(tarballs);

  for (const check of result.checks) {
    process.stdout.write(`  ${check.ok ? '✓' : '✗'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}\n`);
  }

  rmSync(staging, { recursive: true, force: true });
  process.stdout.write(`\n${result.ok ? 'external consumers: all pass' : 'external consumers: FAILED'}\n`);
  process.exit(result.ok ? 0 : 1);
}
