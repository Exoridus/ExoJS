import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch as osArch, cpus, platform as osPlatform, release as osRelease } from 'node:os';
import { dirname, resolve } from 'node:path';

/**
 * Domain-agnostic provenance primitives (review #325: the provenance header was
 * rendering-coupled and living under `rendering/`).
 *
 * A wall-clock number is meaningless without the context that produced it, and
 * that context splits into a genuinely shared part — WHEN the run happened and
 * WHICH version of the primary package under test produced it — and a
 * domain-specific part. Rendering adds the GPU adapter string, launch flags and
 * the software-rasterizer honesty bit; physics adds the Node runtime and CPU
 * host. Those domain parts stay in each domain's driver, extending
 * {@link BaseProvenance}.
 */

/** The provenance fields every domain records, regardless of what it measured. */
export interface BaseProvenance {
  /** ISO-8601 timestamp of the run. */
  readonly timestamp: string;
  /** Version of the primary package under test (ExoJS core for rendering, `@codexo/exojs-physics` for physics). */
  readonly engineVersion: string;
}

/**
 * Provenance for one committed library arm: the exact installed version and
 * where it was resolved from. Stamped into every report header so a comparison
 * ("ExoJS vs Pixi", "stay-native vs adapter") is auditable — a reader can see
 * precisely which build produced the numbers and reproduce it.
 */
export interface LibraryProvenance {
  /** npm package name, e.g. `pixi.js` or `@codexo/exojs-physics`. */
  readonly name: string;
  /** Exact installed version (from the resolved package manifest). */
  readonly version: string;
  /** Absolute path the manifest was resolved from — the reproducibility receipt. */
  readonly resolvedFrom: string;
}

/**
 * Read the installed version + resolution path of each named package arm.
 *
 * Resolution walks up from the package's main entry to its `package.json` (some
 * packages do not expose `./package.json` in `exports`, so a direct
 * `require.resolve('<name>/package.json')` can fail). A package that cannot be
 * resolved is recorded as `not-installed` rather than throwing — a run that does
 * not need every arm present must not be blocked by a missing one.
 *
 * Lifted out of the rendering driver (where it was hardcoded to `['pixi.js']`)
 * so the physics domain can read `@codexo/exojs-physics`'s version the same way.
 */
export const readLibraryProvenance = (names: readonly string[]): LibraryProvenance[] => {
  const nodeRequire = createRequire(import.meta.url);
  const provenance: LibraryProvenance[] = [];

  for (const name of names) {
    try {
      let manifestPath: string;

      try {
        manifestPath = nodeRequire.resolve(`${name}/package.json`);
      } catch {
        // Package hides ./package.json behind exports: walk up from the entry.
        let dir = dirname(nodeRequire.resolve(name));

        while (!existsSync(resolve(dir, 'package.json'))) {
          const parent = dirname(dir);

          if (parent === dir) {
            throw new Error(`could not locate package.json for '${name}'`);
          }

          dir = parent;
        }

        manifestPath = resolve(dir, 'package.json');
      }

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string };

      provenance.push({ name, version: manifest.version ?? 'unknown', resolvedFrom: manifestPath });
    } catch {
      provenance.push({ name, version: 'not-installed', resolvedFrom: '' });
    }
  }

  return provenance;
};

/**
 * Host + runtime provenance for a CPU-bound (Node) benchmark domain. A physics
 * step-time number is only comparable across runs if the CPU and Node version
 * that produced it are on the record — the CPU-domain analogue of rendering's
 * GPU adapter string.
 */
export interface HostInfo {
  /** `process.version`, e.g. `v24.14.1`. */
  readonly node: string;
  /** First logical CPU's model string (all cores are assumed identical). */
  readonly cpu: string;
  /** Number of logical CPUs reported by the OS. */
  readonly cpuCount: number;
  /** `os.platform()` + `os.release()`, e.g. `win32 10.0.26100`. */
  readonly os: string;
  /** `os.arch()`, e.g. `x64`. */
  readonly arch: string;
}

/** Snapshot the Node runtime + CPU host for a CPU-bound domain's provenance header. */
export const readHostInfo = (): HostInfo => {
  const logicalCpus = cpus();

  return {
    node: process.version,
    cpu: logicalCpus[0]?.model.trim() ?? 'unknown',
    cpuCount: logicalCpus.length,
    os: `${osPlatform()} ${osRelease()}`,
    arch: osArch(),
  };
};
