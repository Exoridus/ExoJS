/**
 * External consumer smoke for the coordinated release.
 *
 * Installs the packed tarballs into a throwaway project OUTSIDE the
 * repository (so no workspace/source resolution can leak in) and proves they
 * work for the three audiences a published release must serve:
 *
 *   - Node (ESM runtime): `import` each package and assert key exports exist.
 *   - TypeScript / Vite (bundler resolution): type-check a consumer module with
 *     `moduleResolution: bundler` — exactly the resolution Vite/esbuild use —
 *     against the shipped `.d.ts`. Combined with `attw`'s `bundler 🟢` this is
 *     the Vite-consumer proof without needing Vite installed.
 *
 * Fully offline: the only runtime dependency in the set (@codexo/exojs-tiled →
 * @codexo/exojs-tilemap) is satisfied by the tilemap tarball installed
 * alongside, so `npm install --offline` of all of them resolves with no
 * registry access.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCKSTEP_PACKAGES } from './lockstep-packages.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tscBin = resolve(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

export interface ConsumerCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

const run = (command: string, args: string[], cwd: string): { code: number; output: string } => {
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

const CONSUMER_TS = `import { Application, Scene } from '@codexo/exojs';
import { ParticleSystem, particlesExtension } from '@codexo/exojs-particles';
import { TileMap, tilemapExtension } from '@codexo/exojs-tilemap';
import { TiledMap, tiledExtension } from '@codexo/exojs-tiled';
import { PhysicsWorld } from '@codexo/exojs-physics';
import { PhysicsDebugDraw } from '@codexo/exojs-physics/debug';
import { AudioAnalyser, BeatDetector, ReverbEffect } from '@codexo/exojs-audio-fx';
import { AsepriteSheet, asepriteExtension } from '@codexo/exojs-aseprite';
import { LdtkMap, ldtkExtension } from '@codexo/exojs-ldtk';

export class DemoScene extends Scene {}

export function bootstrap(): { app: Application; system: typeof ParticleSystem; tiles: typeof TileMap; map: typeof TiledMap } {
    const app = new Application();
    void particlesExtension;
    void tilemapExtension;
    void tiledExtension;
    void PhysicsWorld;
    void PhysicsDebugDraw;
    void AudioAnalyser;
    void BeatDetector;
    void ReverbEffect;
    void AsepriteSheet;
    void asepriteExtension;
    void LdtkMap;
    void ldtkExtension;
    return { app, system: ParticleSystem, tiles: TileMap, map: TiledMap };
}
`;

const CONSUMER_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'es2022',
      lib: ['es2022', 'dom', 'dom.iterable'],
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
    },
    include: ['consumer.ts'],
  },
  null,
  2,
);

const NODE_SMOKE = `import * as exo from '@codexo/exojs';
import * as particles from '@codexo/exojs-particles';
import * as tilemap from '@codexo/exojs-tilemap';
import * as tiled from '@codexo/exojs-tiled';
import * as physics from '@codexo/exojs-physics';
import * as physicsDebug from '@codexo/exojs-physics/debug';
import * as audioFx from '@codexo/exojs-audio-fx';
import * as aseprite from '@codexo/exojs-aseprite';
import * as ldtk from '@codexo/exojs-ldtk';

const checks = [
  ['@codexo/exojs Application', typeof exo.Application === 'function'],
  ['@codexo/exojs Scene', typeof exo.Scene === 'function'],
  ['@codexo/exojs-particles ParticleSystem', typeof particles.ParticleSystem === 'function'],
  ['@codexo/exojs-particles particlesExtension', particles.particlesExtension != null],
  ['@codexo/exojs-tilemap TileMap', typeof tilemap.TileMap === 'function'],
  ['@codexo/exojs-tilemap tilemapExtension', tilemap.tilemapExtension != null],
  ['@codexo/exojs-tiled TiledMap', typeof tiled.TiledMap === 'function'],
  ['@codexo/exojs-tiled tiledExtension', tiled.tiledExtension != null],
  ['facade TileMap identity (tiled === tilemap)', tiled.TileMap === tilemap.TileMap],
  ['@codexo/exojs-physics PhysicsWorld', typeof physics.PhysicsWorld === 'function'],
  ['@codexo/exojs-physics/debug PhysicsDebugDraw', typeof physicsDebug.PhysicsDebugDraw === 'function'],
  ['@codexo/exojs-audio-fx AudioAnalyser', typeof audioFx.AudioAnalyser === 'function'],
  ['@codexo/exojs-audio-fx BeatDetector', typeof audioFx.BeatDetector === 'function'],
  ['@codexo/exojs-audio-fx ReverbEffect', typeof audioFx.ReverbEffect === 'function'],
  ['@codexo/exojs-aseprite AsepriteSheet', typeof aseprite.AsepriteSheet === 'function'],
  ['@codexo/exojs-aseprite asepriteExtension', aseprite.asepriteExtension != null],
  ['@codexo/exojs-ldtk LdtkMap', typeof ldtk.LdtkMap === 'function'],
  ['@codexo/exojs-ldtk ldtkExtension', ldtk.ldtkExtension != null],
  ['facade ldtk TileMap identity (ldtk === tilemap)', ldtk.TileMap === tilemap.TileMap],
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
  const consumerDir = mkdtempSync(join(tmpdir(), 'exo-consumer-'));
  const checks: ConsumerCheck[] = [];

  try {
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'exo-external-consumer', private: true, type: 'module', version: '1.0.0' }, null, 2),
    );

    // 1. Install all tarballs offline (tiled's tilemap dep resolves
    // against the tilemap tarball installed alongside → no registry).
    const install = run('npm', ['install', '--no-audit', '--no-fund', '--offline', '--no-save', ...tarballs], consumerDir);
    // `--no-save` keeps package.json clean; pass tarballs positionally.
    const installOk = install.code === 0 && existsSync(join(consumerDir, 'node_modules', '@codexo', 'exojs'));
    checks.push({
      name: `install (offline, ${tarballs.length} tarballs)`,
      ok: installOk,
      detail: installOk ? undefined : install.output.trim().split('\n').slice(-3).join(' '),
    });
    if (!installOk) {
      return { ok: false, consumerDir, checks };
    }

    // 2. Node ESM runtime import smoke.
    writeFileSync(join(consumerDir, 'node-smoke.mjs'), NODE_SMOKE);
    const node = run('node', ['node-smoke.mjs'], consumerDir);
    checks.push({
      name: 'Node ESM import',
      ok: node.code === 0 && node.output.includes('NODE_OK'),
      detail: node.code === 0 ? undefined : node.output.trim().split('\n').slice(-3).join(' '),
    });

    // 3. TypeScript / Vite (bundler resolution) type-check against shipped .d.ts.
    writeFileSync(join(consumerDir, 'consumer.ts'), CONSUMER_TS);
    writeFileSync(join(consumerDir, 'tsconfig.json'), CONSUMER_TSCONFIG);
    const tsc = run('node', [tscBin, '--noEmit', '-p', 'tsconfig.json'], consumerDir);
    checks.push({
      name: 'TypeScript bundler-resolution type-check',
      ok: tsc.code === 0,
      detail: tsc.code === 0 ? undefined : tsc.output.trim().split('\n').slice(-5).join(' '),
    });

    return { ok: checks.every(c => c.ok), consumerDir, checks };
  } finally {
    rmSync(consumerDir, { recursive: true, force: true });
  }
};

// CLI: pack the official packages into a temp dir and run the checks.
if (import.meta.url.startsWith('file:') && fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const staging = mkdtempSync(join(tmpdir(), 'exo-cons-pack-'));
  // Offline-smoke subset (excludes @codexo/exojs-react — its react peers are not
  // resolvable offline). Derived from the single source of truth.
  const smokePackages = LOCKSTEP_PACKAGES.filter(p => p.inOfflineSmoke);
  const dirs = smokePackages.map(p => (p.dir === '.' ? repoRoot : resolve(repoRoot, p.dir)));
  const version = (JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { version: string }).version;

  for (const dir of dirs) {
    const r = run('pnpm', ['pack', '--pack-destination', staging, '--config.ignore-scripts=true'], dir);
    if (r.code !== 0) {
      process.stderr.write(`pack failed for ${dir}:\n${r.output}\n`);
      process.exit(1);
    }
  }
  const tarballs = smokePackages.map(p => join(staging, `${p.name.replace('@', '').replace('/', '-')}-${version}.tgz`));

  process.stdout.write('\n=== verify:external-consumers ===\n');
  const result = verifyExternalConsumers(tarballs);
  for (const check of result.checks) {
    process.stdout.write(`  ${check.ok ? '✓' : '✗'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}\n`);
  }
  rmSync(staging, { recursive: true, force: true });
  process.stdout.write(`\n${result.ok ? 'external consumers: all pass' : 'external consumers: FAILED'}\n`);
  process.exit(result.ok ? 0 : 1);
}
