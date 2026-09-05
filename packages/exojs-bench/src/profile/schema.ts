import type { AggregatedBackendComparison, AggregatedSection } from '../comparison/pooled';
import type { Backend } from '../rendering/EngineAdapter';
import type { PrereleaseStamp, RenderingBrowser } from '../shared/provenance';

/**
 * The published machine-profile document.
 *
 * One file under `packages/exojs-bench/results/` describes one machine profile:
 * what was measured, on which hardware, with which library versions, and the
 * comparison model built from those measurements. The file is the only contract
 * between the benchmark harness and anything that publishes the numbers - a
 * consumer reads this shape and never the raw run artifacts, which are
 * machine-local and never committed.
 *
 * Three properties make the document safe to publish. The comparison model is
 * copied verbatim from what `bench:compare` computed, so no verdict, ratio or
 * mechanism can be authored by hand; every published number is pooled from
 * several separate runs and carries the spread those runs observed, so a single
 * unlucky measurement cannot set it; and the whole document is covered by a
 * {@link ProfileSignature} that recomputes from its own contents, so an edited
 * number no longer matches the file it sits in.
 *
 * A document may carry one domain or both. `rendering` is absent when the
 * profile was written from a physics measurement alone, `physics` when it was
 * written from a rendering measurement alone; at least one is always present. A
 * consumer must read a missing domain as "not measured on this machine", never
 * as zero.
 */

/** Schema version `bench:compare` stamps into a new document. */
export const BENCH_PROFILE_SCHEMA_VERSION = 3;

/**
 * Schema versions a reader accepts. A document carrying anything else is
 * rejected rather than parsed on a guess: the fields a consumer needs may have
 * changed meaning, and a silently misread benchmark is worse than a missing one.
 *
 * Earlier versions are deliberately absent, and no compatibility path exists for
 * them. Version 1 described a single run, which cannot support a published
 * ratio. Version 2 pooled runs but named no browser per stamp, because the
 * harness measured in one; a reader cannot tell whether such a file describes
 * the browser it would name today, and a benchmark attributed to the wrong
 * engine is worse than a missing one.
 */
export const SUPPORTED_BENCH_PROFILE_SCHEMA_VERSIONS: readonly number[] = [BENCH_PROFILE_SCHEMA_VERSION];

/** Characters a slug may be built from. */
const SLUG_CHARACTERS = /^[a-z0-9-]+$/;

/** True for a well-formed slug: lowercase ASCII words joined by single hyphens. */
export const isProfileSlug = (slug: string): boolean => SLUG_CHARACTERS.test(slug) && !slug.startsWith('-') && !slug.endsWith('-') && !slug.includes('--');

/**
 * The machine profile a document describes, and the parts its slug was derived
 * from.
 *
 * The slug is `<gpu>-<os>-<browser>` and is also the file's base name, so a
 * re-measurement of the same machine overwrites the file it belongs to and a
 * different machine can only ever arrive as a new file. Every part is derived
 * from the stamped provenance; none of them is typed by hand.
 */
export interface BenchProfile {
  /** `<gpu>-<os>-<browser>`, and the file's base name without the extension. */
  readonly slug: string;
  /**
   * Normalized GPU part, derived from the rendering provenance's adapter
   * string - or from the CPU model when the document carries physics alone,
   * since a physics run exercises no GPU and naming one would be a claim the
   * file cannot support.
   */
  readonly gpu: string;
  /** Normalized operating system, e.g. `windows`, `macos`, `linux`. */
  readonly os: string;
  /**
   * JavaScript runtime the numbers were taken in: the browser this run selected
   * for the rendering harness, or `node` for a physics-only document.
   *
   * It is part of the slug, so the same machine measured in two browsers
   * publishes two files rather than overwriting one with the other.
   */
  readonly browser: string;
  /** Engine version every stamp in the document agrees on. */
  readonly engineVersion: string;
  /** Latest ISO-8601 timestamp among the document's stamps: when the profile was measured. */
  readonly measuredAt: string;
  /**
   * How many separate harness runs every measured domain pools.
   *
   * A published number is the median of that many per-run medians, and the
   * verdict beside it was confirmed against each run separately. Both domains
   * of a document pool the same number of runs, so this one value speaks for
   * the whole file.
   */
  readonly runs: number;
}

/**
 * One installed library arm and the version that produced its numbers.
 *
 * The resolution path the run recorded is deliberately dropped: it is an
 * absolute path on the measuring machine and carries nothing a reader of the
 * published file can act on.
 */
export interface ProfileLibrary {
  /** npm package name, e.g. `pixi.js`. */
  readonly name: string;
  /** Exact installed version. */
  readonly version: string;
}

/** Rendering provenance for one backend. One stamp per backend the run exercised. */
export interface RenderingStamp {
  /** Backend these numbers were measured on. */
  readonly backend: Backend;
  /**
   * GPU/adapter identity string as the browser reported it.
   *
   * How much this identifies is the browser's choice, not the harness's: some
   * engines report the device model, others substitute a constant vendor-level
   * string for it. A reader comparing two profiles has to read it together with
   * {@link RenderingStamp.browser}.
   */
  readonly adapter: string;
  /** Browser engine the run was measured in. */
  readonly browser: RenderingBrowser;
  /** Browser build the run was measured in, as the browser reported it. */
  readonly browserVersion: string;
  /** Operating system of the host that drove the browser, e.g. `darwin 25.0.0`. */
  readonly os: string;
  /**
   * Whether the platform is a pre-release build, and what established that.
   *
   * A number measured on a beta operating system or a preview browser build
   * does not describe what anyone ships, so it carries the fact rather than
   * relying on a footnote. `source` distinguishes a status the harness read
   * from one the runner declared and from one nobody established.
   */
  readonly prerelease: PrereleaseStamp;
  /**
   * Browser launch flags the run used. Empty under an engine that takes none;
   * a stamp never carries another browser's flags.
   */
  readonly flags: readonly string[];
  /** Whether the browser ran headless. */
  readonly headless: boolean;
  /** True when the adapter is a software rasterizer, which makes the timings untrusted. */
  readonly software: boolean;
  /** Resolved WebGPU sprite-batch texture-slot tier; absent for a backend that negotiates none. */
  readonly slotTier?: number;
  /** Engine version under test. */
  readonly engineVersion: string;
  /** ISO-8601 timestamp of the run. */
  readonly timestamp: string;
}

/** Host the physics numbers were measured on. */
export interface ProfileHost {
  /** Node runtime version. */
  readonly node: string;
  /** CPU model string. */
  readonly cpu: string;
  /** Logical CPU count. */
  readonly cpuCount: number;
  /** Platform and release, e.g. `win32 10.0.26200`. */
  readonly os: string;
  /** CPU architecture, e.g. `x64`. */
  readonly arch: string;
}

/** Physics provenance. One stamp per run: physics has no backend axis. */
export interface PhysicsStamp {
  /** Node runtime and CPU host the step times were measured on. */
  readonly host: ProfileHost;
  /** Fixed physics timestep (seconds) each timed step advanced. */
  readonly fixedDelta: number;
  /** Caveats the run disclosed about how the numbers were produced. */
  readonly caveats: readonly string[];
  /** Physics engine version under test. */
  readonly engineVersion: string;
  /** ISO-8601 timestamp of the run. */
  readonly timestamp: string;
}

/** One pooled rendering run's provenance. */
export interface RenderingRun {
  /** One stamp per backend this run exercised. */
  readonly provenance: readonly RenderingStamp[];
}

/** The rendering half of a document: per-run provenance, arms, and the pooled per-backend comparison. */
export interface RenderingProfile {
  /**
   * One entry per pooled run, in the order the runs were measured. Every run is
   * kept: a reader judging the spread beside a number needs to see how many
   * measurements it came from and when each was taken.
   */
  readonly runs: readonly RenderingRun[];
  /** Competitor library arms and their versions. */
  readonly libraries: readonly ProfileLibrary[];
  /** The comparison model, one block per backend, exactly as `bench:compare` computed it. */
  readonly backends: readonly AggregatedBackendComparison[];
}

/** The physics half of a document: per-run provenance, arms, and the pooled comparison section. */
export interface PhysicsProfile {
  /** One stamp per pooled run, in the order the runs were measured; physics has no backend axis. */
  readonly runs: readonly PhysicsStamp[];
  /** Physics engine arms and their versions. */
  readonly libraries: readonly ProfileLibrary[];
  /** The comparison model, exactly as `bench:compare` computed it. */
  readonly section: AggregatedSection;
}

/**
 * Integrity cover over a document.
 *
 * The value recomputes from the document's own contents, so any later edit - a
 * retyped median, an added row, a changed adapter string - leaves a file whose
 * signature no longer matches it, and `verify:bench-results` rejects it. It is
 * an integrity check, not an authenticity proof: anyone holding the repository
 * can recompute it, so it establishes that the file was written as a whole by
 * the harness and not touched since, not who ran the harness.
 */
export interface ProfileSignature {
  /** Hash algorithm the value was produced with. */
  readonly algorithm: 'sha256';
  /** Lowercase hex digest. */
  readonly value: string;
}

/** A published machine-profile document, as stored in `packages/exojs-bench/results/<slug>.json`. */
export interface BenchProfileDocument {
  /** Schema version, checked against {@link SUPPORTED_BENCH_PROFILE_SCHEMA_VERSIONS} before anything else is read. */
  readonly schemaVersion: number;
  /** Machine profile and slug parts. */
  readonly profile: BenchProfile;
  /** Rendering domain, absent when the profile was written from a physics run alone. */
  readonly rendering?: RenderingProfile;
  /** Physics domain, absent when the profile was written from a rendering run alone. */
  readonly physics?: PhysicsProfile;
  /** Integrity cover over every field above. */
  readonly signature: ProfileSignature;
}
