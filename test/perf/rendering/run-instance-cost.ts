/**
 * Per-instance RETAINED cost probe.
 *
 * The bootstrap runner says a phase retained N megabytes; this says what one
 * instance of a given class costs, so a construction bucket can be decomposed
 * into the objects that actually make it up rather than attributed to whichever
 * constructor frame the sampler happened to label.
 *
 *   pnpm perf:renderers:instance-cost                # every type, fresh process each
 *   pnpm perf:renderers:instance-cost -- --type Sprite --n 200000
 *
 * ── Method ──────────────────────────────────────────────────────────────────
 * Pre-size the holder array, settle the collector, read `heapUsed`, fill the
 * holder, settle again, read again. The delta divided by `n` is retained bytes
 * per instance INCLUDING everything the instance keeps alive (a `Rectangle`
 * reports its `ObservableVector`, its `ObservableSize` and its bound callback,
 * because those are what it costs).
 *
 * This is a residency measurement, not an allocation-traffic one, and it is the
 * second indicator the bootstrap runner's sampler numbers are checked against:
 * the two answer different questions and neither is inferred from the other.
 *
 * Requires `--expose-gc` (the script wires it).
 *
 * @internal Test/perf-only.
 */
import { spawnSync } from 'node:child_process';

import { Color } from '#core/Color';
import { Bounds } from '#math/Bounds';
import { Flags } from '#math/Flags';
import { Matrix } from '#math/Matrix';
import { ObservableVector } from '#math/ObservableVector';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';

import { makeTextures } from './fixtures';

const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

const n = Number(flag('n') ?? 200000);
const type = flag('type');

const gc = globalThis.gc as (() => void) | undefined;

const settle = (): number => {
  gc?.();
  gc?.();

  return process.memoryUsage().heapUsed;
};

const texture = makeTextures(1)[0]!;

/**
 * Each factory must allocate one fresh instance and nothing shared, so the
 * holder slot is the only thing keeping it alive.
 */
const FACTORIES: Record<string, () => unknown> = {
  'Object{}': () => ({}),
  'Array[]': () => [],
  Closure: () => () => texture,
  'Float32Array(8)': () => new Float32Array(8),
  'Uint32Array(4)': () => new Uint32Array(4),
  Vector: () => new Vector(0, 0),
  ObservableVector: () => new ObservableVector(null, 0, 0, 0),
  Matrix: () => new Matrix(),
  Flags: () => new Flags(),
  Color: () => Color.white.clone(),
  Rectangle: () => new Rectangle(),
  Bounds: () => new Bounds(),
  Container: () => new Container(),
  Sprite: () => new Sprite(texture),
};

if (type === undefined) {
  // Driver mode: one fresh process per type, so no type pays for another's
  // fragmentation or for a holder array that already grew.
  const rows: Array<{ type: string; bytesPerInstance: number }> = [];

  for (const name of Object.keys(FACTORIES)) {
    const run = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        '--max-old-space-size=8192',
        '--conditions=@codexo/exojs-source',
        '--import',
        './scripts/glsl-register.ts',
        '--import',
        'tsx/esm',
        'test/perf/rendering/run-instance-cost.ts',
        '--type',
        name,
        '--n',
        String(n),
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );

    if (run.status !== 0) {
      process.stderr.write(run.stderr ?? '');
      throw new Error(`instance-cost cell for '${name}' exited with ${String(run.status)}`);
    }

    const lines = run.stdout.trim().split('\n');
    const cell = JSON.parse(lines[lines.length - 1]!) as { type: string; bytesPerInstance: number };

    rows.push(cell);
    console.log(`${cell.type.padEnd(18)} ${cell.bytesPerInstance.toFixed(1).padStart(9)} bytes/instance retained`);
  }

  console.log(`\n${JSON.stringify({ n, rows })}`);
  process.exit(0);
}

const factory = FACTORIES[type];

if (factory === undefined) {
  throw new Error(`unknown type '${type}' (known: ${Object.keys(FACTORIES).join(', ')})`);
}

// Pre-sized so the holder's own growth is paid before the baseline is read.
const holder: unknown[] = new Array<unknown>(n).fill(null);
const before = settle();

for (let i = 0; i < n; i++) {
  holder[i] = factory();
}

const after = settle();

// Touch the holder after the second reading so nothing above can be optimised
// away as dead.
if (holder[n - 1] === undefined) {
  throw new Error('holder was not filled');
}

console.log(JSON.stringify({ type, n, gcAvailable: gc !== undefined, bytesPerInstance: (after - before) / n }));
