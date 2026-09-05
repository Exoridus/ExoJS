import type { PhysicsStamp, RenderingStamp } from './schema';

/**
 * Derivation of a machine profile's slug from the stamped provenance.
 *
 * The slug is `<gpu>-<os>-<browser>` and doubles as the result file's name, so
 * it decides which file a re-measurement overwrites. It is therefore derived,
 * never typed: two runs on one machine must produce one name, and a run on a
 * different machine must not be able to land on someone else's file by an
 * inconsistent hand-written label.
 *
 * Each part comes from a different stamp, and a document may carry only one
 * domain, so each part has a documented fallback:
 *
 * - **gpu** - the rendering adapter string, normalized. With no rendering
 *   domain there is no GPU to name, and the CPU model takes its place; the
 *   `browser` part then reads `node`, so the pair cannot be mistaken for a
 *   graphics measurement. How specific this part can be is decided by the
 *   browser: an engine that reports a constant vendor-level string in place of
 *   the device model yields a correspondingly coarse part, which the `browser`
 *   part beside it accounts for.
 * - **os** - taken from whichever stamp read the platform directly, the physics
 *   host's or the rendering run's. Only a document carrying neither falls back
 *   to inferring it from the graphics API named in the adapter string.
 * - **browser** - the browser the run selected, or `node` for a physics-only
 *   document, whose numbers were taken in the Node process itself. Two browsers
 *   on one machine therefore produce two files, which is the point: their
 *   numbers are not comparable with each other.
 */

/** Runtime part used when a document carries physics alone. */
export const PHYSICS_RUNTIME = 'node';

/**
 * Vendor and product-line words dropped from the front of a normalized part
 * name. They repeat what the model token already says (`rtx 5070 ti` is an
 * NVIDIA GeForce part by construction) and would otherwise push the identifying
 * token out of the middle of every file name.
 *
 * `apple` is deliberately absent: its part names are bare generation tokens
 * (`m3 max`) that identify nothing on their own.
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
]);

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

/**
 * Reduce an adapter string to the GPU part it names.
 *
 * Handles the three shapes browsers report: a bare model (`Apple M3 Max`), an
 * ANGLE triple whose middle field is the device description, and a
 * `<api> Renderer: <model>` form where the model follows the colon. Returns an
 * empty string when nothing identifying is left.
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

/** Reduce a CPU model string to the part it names, dropping package and clock detail. */
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
 * Only used when the document carries no physics domain, whose host stamp
 * records the platform outright.
 */
const inferOsFromAdapter = (adapter: string): string | null => {
  const text = adapter.toLowerCase();

  if (text.includes('d3d') || text.includes('direct3d')) return 'windows';
  if (text.includes('metal')) return 'macos';
  if (text.includes('opengl') || text.includes('vulkan') || text.includes('mesa')) return 'linux';

  return null;
};

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
  readonly gpu: string;
  readonly os: string;
  readonly browser: string;
}

/**
 * Pick the adapter that names the GPU most precisely.
 *
 * A run stamps one adapter per backend and they disagree in specificity: a
 * WebGL2 stamp reports a device model where the matching WebGPU stamp reports
 * an architecture family, and under other browsers it is the other way round.
 * The one carrying a model number is the more specific of the two, so it wins
 * regardless of which backend produced it; without one, recorded order decides.
 */
const chooseGpu = (stamps: readonly RenderingStamp[]): string => {
  const candidates = stamps.map(stamp => normalizeGpuAdapter(stamp.adapter)).filter(name => name.length > 0);

  return candidates.find(name => /\d/.test(name)) ?? candidates[0] ?? '';
};

/**
 * Derive the profile parts and slug from a run's provenance.
 *
 * Throws when a part cannot be derived - a profile whose machine cannot be
 * named must not be written under a guessed file name, because the next run on
 * that machine would not find it again.
 */
export const deriveProfileParts = (sources: SlugSources): ProfileParts => {
  const stamps = sources.rendering ?? [];
  const gpu = stamps.length > 0 ? chooseGpu(stamps) : normalizeCpuModel(sources.physics?.host.cpu ?? '');

  if (gpu.length === 0) {
    throw new Error('Cannot derive the profile slug: the run stamped no adapter or CPU model to name the machine by.');
  }

  // A directly recorded platform beats one inferred from a graphics API: both
  // domains read it from the same `os` module, and inference is a guess the
  // adapter string only sometimes supports.
  const recordedOs = sources.physics === undefined ? (stamps.find(stamp => stamp.os.length > 0)?.os ?? '') : sources.physics.host.os;
  const os = recordedOs.length > 0 ? normalizeOsName(recordedOs) : (stamps.map(stamp => inferOsFromAdapter(stamp.adapter)).find(name => name !== null) ?? '');

  if (os.length === 0) {
    throw new Error(
      'Cannot derive the profile slug: no run recorded the operating system and no adapter string names a graphics API it could be inferred from. Pass --physics as well.',
    );
  }

  // Every stamp of one run names the same browser - one run drives one engine -
  // so the first stamp speaks for the document.
  const browser = stamps[0]?.browser ?? PHYSICS_RUNTIME;

  return { slug: `${gpu}-${os}-${browser}`, gpu, os, browser };
};
