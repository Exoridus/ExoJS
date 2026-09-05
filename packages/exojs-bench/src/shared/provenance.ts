import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch as osArch, cpus, platform as osPlatform, release as osRelease } from 'node:os';
import { dirname, resolve } from 'node:path';

/**
 * Domain-agnostic provenance primitives.
 *
 * A wall-clock number is meaningless without the context that produced it, and
 * that context splits into a genuinely shared part - WHEN the run happened and
 * WHICH version of the primary package under test produced it - and a
 * domain-specific part. Rendering adds the GPU adapter string, launch flags and
 * the software-rasterizer honesty bit; physics adds the Node runtime and CPU
 * host. Those domain parts stay in each domain's driver, extending
 * {@link BaseProvenance}.
 */

/** Browsers the rendering harness can measure in. */
export const RENDERING_BROWSERS = ['chromium', 'webkit'] as const;

/**
 * The browser one rendering run was measured in.
 *
 * The choice belongs to the run, not to the harness: the two engines differ in
 * which backends they expose, in what they disclose about the GPU, and in how
 * fast they are, so a number is only comparable against another taken in the
 * same one. Every rendering stamp therefore names its browser, and the machine
 * profile's slug carries it.
 */
export type RenderingBrowser = (typeof RENDERING_BROWSERS)[number];

/**
 * Browser used when a run does not select one.
 *
 * Chromium is the default because it is the only engine that exposes WebGPU on
 * every platform the harness runs on; WebKit reaches it on macOS alone.
 */
export const DEFAULT_RENDERING_BROWSER: RenderingBrowser = 'chromium';

/** Resolve the `--browser` selector, or throw naming the browsers that exist. */
export const parseRenderingBrowser = (raw: string | undefined): RenderingBrowser => {
  if (raw === undefined) {
    return DEFAULT_RENDERING_BROWSER;
  }

  if ((RENDERING_BROWSERS as readonly string[]).includes(raw)) {
    return raw as RenderingBrowser;
  }

  throw new Error(`--browser must be one of [${RENDERING_BROWSERS.join(', ')}] (got '${raw}').`);
};

/** How a run's pre-release status was established. */
export type PrereleaseSource = 'detected' | 'declared' | 'assumed-stable';

/**
 * Whether a run was taken on a pre-release platform, and on what that rests.
 *
 * A measurement taken on a beta operating system or a preview browser build is
 * not a measurement of what anyone ships, so it has to say so in the data
 * rather than in a footnote a reader can drop. `source` is what makes the claim
 * auditable: `assumed-stable` records that nothing established the platform's
 * status, which is a weaker statement than a stable platform and must not be
 * read as one.
 */
export interface PrereleaseStamp {
  /** True when the platform is known to be pre-release. */
  readonly value: boolean;
  /** How {@link value} was arrived at. */
  readonly source: PrereleaseSource;
  /** The version string, the runner's declaration, or the reason nothing established it. */
  readonly evidence: string;
}

/**
 * Words a browser puts in its own version string when the build is not a
 * shipping one. Deliberately not a table of known pre-release version numbers:
 * such a table goes stale silently and would start passing beta builds as
 * stable, which is the one failure this field exists to prevent.
 */
const PRERELEASE_BROWSER_MARKER = /\b(?:alpha|beta|canary|dev|nightly|preview|tp)\b/i;

/**
 * Classify a run's platform, preferring evidence the harness read itself.
 *
 * The browser version is the only pre-release evidence available at runtime: a
 * build that is not shipping usually names itself so. The operating system's
 * own release status is not readable - `os.release()` reports the kernel
 * version, which on macOS is identical for a beta and for the release it
 * becomes - so a beta OS has to be declared by whoever measured on it, and the
 * result records that it was declared rather than observed.
 */
export const classifyPrerelease = (options: { browserVersion: string; declared?: string | undefined }): PrereleaseStamp => {
  const marker = PRERELEASE_BROWSER_MARKER.exec(options.browserVersion);

  if (marker !== null) {
    return { value: true, source: 'detected', evidence: `browser version '${options.browserVersion}' names a '${marker[0].toLowerCase()}' build` };
  }

  const declared = options.declared?.trim() ?? '';

  if (declared.length > 0) {
    return { value: true, source: 'declared', evidence: declared === 'true' ? 'declared by the runner, without a stated reason' : declared };
  }

  return {
    value: false,
    source: 'assumed-stable',
    evidence: `browser version '${options.browserVersion}' carries no pre-release marker and none was declared; the operating system's own release status cannot be read at runtime`,
  };
};

/** `os.platform()` and `os.release()` joined, e.g. `win32 10.0.26200`. */
export const readOsRelease = (): string => `${osPlatform()} ${osRelease()}`;

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
 * ("ExoJS vs Pixi", "stay-native vs adapter") is auditable - a reader can see
 * precisely which build produced the numbers and reproduce it.
 */
export interface LibraryProvenance {
  /** npm package name, e.g. `pixi.js` or `@codexo/exojs-physics`. */
  readonly name: string;
  /** Exact installed version (from the resolved package manifest). */
  readonly version: string;
  /** Absolute path the manifest was resolved from - the reproducibility receipt. */
  readonly resolvedFrom: string;
}

/**
 * Read the installed version + resolution path of each named package arm.
 *
 * Resolution walks up from the package's main entry to its `package.json` (some
 * packages do not expose `./package.json` in `exports`, so a direct
 * `require.resolve('<name>/package.json')` can fail). A package that cannot be
 * resolved is recorded as `not-installed` rather than throwing - a run that does
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
 * that produced it are on the record - the CPU-domain analogue of rendering's
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
    os: readOsRelease(),
    arch: osArch(),
  };
};
