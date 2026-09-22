import type { PlatformVersionStamp } from '../shared/provenance';
import type { PhysicsStamp, ProfilePlatform, RenderingStamp } from './schema';

/**
 * Derivation of a machine profile's slug from the stamped provenance.
 *
 * The slug is `<machine>-<os>-<major>[-beta]-<browser>` and doubles as the
 * result file's name, so it decides which file a re-measurement overwrites. It
 * is therefore derived, never typed: two runs on one machine must produce one
 * name, and a run on a different machine must not be able to land on someone
 * else's file by an inconsistent hand-written label.
 *
 * Each part comes from a different stamp, and a document may carry only one
 * domain, so each part has a documented fallback:
 *
 * - **machine** - the rendering adapter string, normalized. Some browsers
 *   substitute a constant for the GPU rather than reporting it (WebKit reports
 *   `Apple GPU` on every machine, including one with an NVIDIA card in it), and
 *   a vendor-stripped adapter can also reduce to a bare category word such as
 *   `graphics`. Neither names a machine, so the CPU model takes over, exactly as
 *   it does for a document carrying physics alone. On Apple silicon that is also
 *   the correct name for the GPU, which is part of the same package. The CPU
 *   model lives in the physics provenance, so a rendering-only run whose adapter
 *   names nothing cannot be slugged at all and fails rather than publishing a
 *   file no later run would find again.
 * - **os** - the platform name, from whichever stamp read it directly, followed
 *   by its major version and, for a pre-release build, `-beta`. The version
 *   keeps a beta-platform measurement and the shipping platform's later one in
 *   separate files instead of letting the second silently replace the first.
 *   Only a document whose stamps recorded no platform falls back to inferring
 *   the name from the graphics API in the adapter string.
 * - **browser** - the browser the run selected. Both domains are measured in
 *   one, so every document names it, and a document carrying both domains must
 *   have taken them in the same browser or it describes no single measurement
 *   condition. Two browsers on one machine therefore produce two files, which is
 *   the point: their numbers are not comparable with each other.
 */

/** Marks the operating-system part of a slug as a pre-release build. */
export const PRERELEASE_SEGMENT = 'beta';

/**
 * Thrown when the stamped provenance does not name a machine profile well
 * enough to be published under a file name a later run would find again.
 */
export class ProfileSlugError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProfileSlugError';
  }
}

/**
 * Vendor and product-line words dropped from the front of a normalized part
 * name. They repeat what the model token already says (`rtx 5070 ti` is an
 * NVIDIA GeForce part by construction) and would otherwise push the identifying
 * token out of the middle of every file name.
 */
const LEADING_NOISE = new Set([
  'angle',
  'nvidia',
  'geforce',
  'amd',
  'ati',
  'radeon',
  'intel',
  'core',
  'iris',
  'arc',
  'uhd',
  'adreno',
  'mali',
  'qualcomm',
  'arm',
  'apple',
]);

/**
 * Normalized names that identify no machine.
 *
 * Each is a category word rather than a model: what is left of a browser's
 * constant privacy substitution (`Apple GPU`) or of an integrated part named
 * only after its vendor (`AMD Radeon Graphics`) once the vendor words are
 * dropped. A part reducing to one of these is treated as no part at all, so the
 * CPU model names the machine instead of a word every machine would share.
 */
const NON_IDENTIFYING = new Set(['gpu', 'graphics', 'renderer', 'device', 'processor', 'unknown']);

/**
 * True when a normalized part is nothing but vendor and product-line words.
 *
 * `dropLeadingNoise` keeps a last part rather than reducing to the empty
 * string, so an adapter made only of those words survives as one of them:
 * WebKit's WebGPU privacy substitution reports `apple apple apple apple` and
 * reduced to the bare vendor word `apple`. That passes the category-word check
 * above - `apple` is a vendor, not a category - and named the machine, which
 * published one machine's runs under two file names depending on which backend
 * the pooling read first. A vendor word identifies no machine for the same
 * reason a category word does not.
 */
const isVendorWordOnly = (name: string): boolean => name.split('-').every(word => LEADING_NOISE.has(word));

/**
 * Where a model name ends. Everything from the first of these onward is the
 * graphics API, driver or device-id tail that the adapter string appends after
 * the part name.
 */
const MODEL_TAIL = /\(|\/|,|\bdirect3d\d*\b|\bd3d\d*\b|\bopengl\b|\bvulkan\b|\bmetal\b|\bvs_\d/i;

/** Trademark markers that would otherwise be read as the start of the tail. */
const TRADEMARK = /\((?:r|tm|c)\)/gi;

/** CPU model suffixes that describe the package rather than the part. */
const CPU_TAIL = /\b\d+-core\b|\bprocessor\b|\bcpu\b|@.*$/gi;

/** Lowercase the text and join its alphanumeric runs with single hyphens. */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

/** Drop the vendor and product-line words that prefix a model name. */
const dropLeadingNoise = (parts: readonly string[]): string[] => {
  const kept = [...parts];

  while (kept.length > 1 && LEADING_NOISE.has(kept[0]!)) {
    kept.shift();
  }

  return kept;
};

/** True when a normalized part names a specific machine rather than a category of them. */
export const isIdentifyingPart = (name: string): boolean => name.length > 0 && !NON_IDENTIFYING.has(name) && !isVendorWordOnly(name);

/**
 * Reduce an adapter string to the GPU part it names.
 *
 * Handles the three shapes browsers report: a bare model (`Apple M3 Max`), an
 * ANGLE triple whose middle field is the device description, and a
 * `<api> Renderer: <model>` form where the model follows the colon. Returns an
 * empty string when nothing identifying is left; a browser that reports a
 * constant instead of the device yields a category word, which
 * {@link isIdentifyingPart} rejects.
 */
export const normalizeGpuAdapter = (adapter: string): string => {
  const withoutTrademarks = adapter.replaceAll(TRADEMARK, ' ');
  const angle = /^\s*angle\s*\((.*)\)\s*$/is.exec(withoutTrademarks);
  const inner = angle === null ? withoutTrademarks : angle[1]!;
  const fields = inner.split(',');
  // An ANGLE triple is `vendor, description, api`; the description is the only
  // field naming the part. Anything else is taken whole and cut at its tail.
  const described = angle !== null && fields.length >= 3 ? fields.slice(1, -1).join(',') : inner;
  const afterColon = described.slice(described.lastIndexOf(':') + 1);
  const head = afterColon.split(MODEL_TAIL)[0] ?? '';

  return dropLeadingNoise(slugify(head).split('-').filter(Boolean)).join('-');
};

/** Reduce a CPU model string to the part it names, dropping vendor, package and clock detail. */
export const normalizeCpuModel = (cpu: string): string =>
  dropLeadingNoise(slugify(cpu.replaceAll(TRADEMARK, ' ').replaceAll(CPU_TAIL, ' ')).split('-').filter(Boolean)).join('-');

/** Map a `platform release` string onto the operating-system name a reader expects. */
export const normalizeOsName = (os: string): string => {
  const platform = slugify(os).split('-')[0] ?? '';

  if (platform === 'win32' || platform === 'windows') return 'windows';
  if (platform === 'darwin' || platform === 'macos') return 'macos';

  return platform;
};

/**
 * The operating system implied by the graphics API an adapter string names.
 * Only used when no stamp recorded the platform outright.
 */
const inferOsFromAdapter = (adapter: string): string | null => {
  const text = adapter.toLowerCase();

  if (text.includes('d3d') || text.includes('direct3d')) return 'windows';
  if (text.includes('metal')) return 'macos';
  if (text.includes('opengl') || text.includes('vulkan') || text.includes('mesa')) return 'linux';

  return null;
};

/** The slug's operating-system part: name, major version, and `-beta` for a pre-release build. */
export const platformSegment = (platform: ProfilePlatform): string =>
  `${platform.name}-${String(platform.version)}${platform.prerelease ? `-${PRERELEASE_SEGMENT}` : ''}`;

/** The stamps a slug can be derived from. At least one domain must be present. */
export interface SlugSources {
  /** Rendering stamps, one per backend, in the order the run recorded them. */
  readonly rendering?: readonly RenderingStamp[];
  /** The physics run's stamp. */
  readonly physics?: PhysicsStamp;
}

/** The derived parts, and the slug they compose. */
export interface ProfileParts {
  readonly slug: string;
  /** Normalized machine name: the GPU the adapter identifies, or the CPU model when it identifies none. */
  readonly gpu: string;
  /** The slug's operating-system part, version and pre-release marker included. */
  readonly os: string;
  readonly browser: string;
  readonly platform: ProfilePlatform;
}

/**
 * Pick the adapter that names the GPU most precisely.
 *
 * A run stamps one adapter per backend and they disagree in specificity: a
 * WebGL2 stamp reports a device model where the matching WebGPU stamp reports
 * an architecture family, and under other browsers it is the other way round.
 * The one carrying a model number is the more specific of the two, so it wins
 * regardless of which backend produced it; without one, recorded order decides.
 * Adapters naming no machine at all are dropped before either rule applies.
 */
const chooseGpu = (stamps: readonly RenderingStamp[]): string => {
  const candidates = stamps.map(stamp => normalizeGpuAdapter(stamp.adapter)).filter(isIdentifyingPart);

  return candidates.find(name => /\d/.test(name)) ?? candidates[0] ?? '';
};

/** The machine part, falling back to the CPU model when no adapter identifies the machine. */
const deriveMachine = (stamps: readonly RenderingStamp[], physics: PhysicsStamp | undefined): string => {
  const fromAdapter = chooseGpu(stamps);

  if (fromAdapter.length > 0) {
    return fromAdapter;
  }

  const fromCpu = normalizeCpuModel(physics?.host.cpu ?? '');

  if (isIdentifyingPart(fromCpu)) {
    return fromCpu;
  }

  if (stamps.length > 0 && physics === undefined) {
    throw new ProfileSlugError(
      `Cannot derive the profile slug: no adapter string names a machine (${stamps.map(stamp => `'${stamp.adapter}'`).join(', ')}), and the CPU model that would name it instead is recorded by the physics domain, which this profile does not carry. Measure the physics domain on the same machine and pass its results.json to bench:compare with --physics.`,
    );
  }

  throw new ProfileSlugError(
    'Cannot derive the profile slug: neither the stamped adapter strings nor the CPU model name a specific machine, so the profile has no name a later measurement of that machine would find again.',
  );
};

/**
 * The one browser the whole document was measured in.
 *
 * Every stamp of one run names the same browser - one run drives one engine -
 * but a document is assembled from a rendering run and a physics run, and
 * nothing forces those to have selected the same one. A disagreement is refused
 * rather than resolved: the slug carries a single browser, so publishing a
 * mixed document would attribute one domain's numbers to the other domain's
 * JavaScript engine.
 */
const chooseBrowser = (stamps: readonly RenderingStamp[], physics: PhysicsStamp | undefined): string => {
  const named = [...new Set([...stamps.map(stamp => stamp.browser), ...(physics === undefined ? [] : [physics.browser])])];

  if (named.length > 1) {
    throw new ProfileSlugError(
      `Cannot derive the profile slug: the document's domains were measured in different browsers (${named.join(', ')}). A profile describes one measurement condition; measure both domains in the same browser.`,
    );
  }

  if (named[0] === undefined) {
    throw new ProfileSlugError('Cannot derive the profile slug: no stamp names the browser the numbers were measured in.');
  }

  return named[0];
};

/** The platform version the document's stamps agree on, preferring one the host reported. */
const choosePlatformVersion = (stamps: readonly RenderingStamp[], physics: PhysicsStamp | undefined): PlatformVersionStamp | undefined => {
  const candidates = [...(physics === undefined ? [] : [physics.host.platformVersion]), ...stamps.map(stamp => stamp.platformVersion)];

  return candidates.find(version => version.source === 'detected') ?? candidates.find(version => version.source === 'declared');
};

/**
 * Derive the profile parts and slug from a run's provenance.
 *
 * Throws {@link ProfileSlugError} when a part cannot be derived - a profile
 * whose machine or platform cannot be named must not be written under a guessed
 * file name, because the next run on that machine would not find it again.
 */
export const deriveProfileParts = (sources: SlugSources): ProfileParts => {
  const stamps = sources.rendering ?? [];
  const gpu = deriveMachine(stamps, sources.physics);

  // A directly recorded platform beats one inferred from a graphics API: both
  // domains read it from the same `os` module, and inference is a guess the
  // adapter string only sometimes supports.
  const recordedOs = sources.physics === undefined ? (stamps.find(stamp => stamp.os.length > 0)?.os ?? '') : sources.physics.host.os;
  const name = recordedOs.length > 0 ? normalizeOsName(recordedOs) : (stamps.map(stamp => inferOsFromAdapter(stamp.adapter)).find(part => part !== null) ?? '');

  if (name.length === 0) {
    throw new ProfileSlugError(
      'Cannot derive the profile slug: no run recorded the operating system and no adapter string names a graphics API it could be inferred from. Pass --physics as well.',
    );
  }

  const version = choosePlatformVersion(stamps, sources.physics);

  if (version === undefined) {
    throw new ProfileSlugError(
      `Cannot derive the profile slug: nothing established the operating system's major version, which the file name carries so that a pre-release platform and the shipping one it becomes do not overwrite each other. Re-measure with --platform=<major>[-beta].`,
    );
  }

  const prerelease = stamps.some(stamp => stamp.prerelease.value) || sources.physics?.prerelease.value === true;
  const platform: ProfilePlatform = { name, version: version.major, versionSource: version.source === 'detected' ? 'detected' : 'declared', prerelease };
  const os = platformSegment(platform);
  const browser = chooseBrowser(stamps, sources.physics);

  return { slug: `${gpu}-${os}-${browser}`, gpu, os, browser, platform };
};
