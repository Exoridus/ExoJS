/**
 * Published benchmark profiles, as the benchmarks page reads them.
 *
 * Every number the page shows comes from a file under
 * `packages/exojs-bench/results/`, written by the benchmark harness and covered
 * by a signature gate. Nothing here computes a timing, a ratio or a verdict: the
 * module loads the documents, decides which one is the reference, and derives
 * only which rows are worth a headline sentence. The values inside that sentence
 * are still copied out of the file.
 *
 * A document pools several separate harness runs, so each cell also carries the
 * spread those runs observed and whether they agreed on the verdict. A cell they
 * disagreed on carries no verdict at all, and no derived sentence counts one -
 * neither as a result nor in a denominator.
 *
 * The directory is legitimately empty - a fresh clone carries no measurement -
 * so every consumer has to render that case. A file whose schema version this
 * reader does not know fails the build instead of being skipped: its fields may
 * have changed meaning, and a page that silently drops a profile is worse than
 * one that refuses to build.
 */

/** Schema version this reader understands; anything else is refused. */
const SUPPORTED_SCHEMA_VERSION = 2;

/**
 * Arms that stand as a reference ceiling rather than as a peer.
 *
 * Rapier is a Rust/WASM engine, so a gap against it measures what leaving
 * JavaScript buys and not how two JavaScript solvers compare. The run discloses
 * the same role in its caveats; the split is repeated here because the headline
 * sentences have to make the distinction before a reader reaches them.
 */
const WASM_REFERENCE_ARMS: readonly string[] = ['rapier'];

/** Rendering backend a block was measured on. */
export type ProfileBackendName = 'webgl2' | 'webgpu';

/** Which arm a cell's comparison favours. */
export type VerdictSide = 'exojs' | 'competitor' | 'neither';

/** One computed comparison of two medians, as the harness placed it on its ladder. */
export interface ProfileVerdict {
  readonly side: VerdictSide;
  /** `exojs / competitor`; `null` when the pair produced no comparable ratio. */
  readonly ratio: number | null;
  /** How many times faster the leading arm is; `null` when neither arm produced a number. */
  readonly factor: number | null;
  /** The ladder's own word for this outcome. */
  readonly label: string;
  /** True when the gap is wide enough to be attributed to structure rather than to measurement conditions. */
  readonly structural: boolean;
}

/** How far one measured value moved across the runs a profile pools. */
export interface ProfileSpread {
  readonly minMs: number | null;
  readonly maxMs: number | null;
  /** `maxMs / minMs`: the measurement's own noise, as a factor. */
  readonly ratio: number | null;
}

/** What the pooled runs agreed and disagreed on for one arm pair. */
export interface ProfileAggregate {
  /** How many runs produced a comparable cell here. */
  readonly runs: number;
  readonly reference: ProfileSpread;
  readonly competitor: ProfileSpread;
  /** False when the runs reached different verdicts; the cell then carries none. */
  readonly stable: boolean;
  /** The ladder rung each run produced, in run order. */
  readonly rungs: readonly string[];
}

/** One competitor's outcome on one row. */
export interface ProfileCell {
  readonly competitor: string;
  /** Median of the per-run medians. */
  readonly referenceMs: number | null;
  /** Median of the per-run medians. */
  readonly competitorMs: number | null;
  readonly verdict: ProfileVerdict;
  /** Structural evidence behind the difference, or `null` when the counters carry none. */
  readonly mechanism: string | null;
  /** Spread and stability of the numbers above. */
  readonly aggregate: ProfileAggregate;
}

/** One published row: an archetype at the block's single node or body count. */
export interface ProfileRow {
  readonly archetype: string;
  readonly category: string;
  readonly count: number;
  readonly cells: readonly ProfileCell[];
}

/** A category section of a published table. */
export interface ProfileSection {
  readonly title: string;
  readonly rows: readonly ProfileRow[];
}

/** A row that was measured but kept out of the table, with the reason. */
export interface ProfileExcluded {
  readonly archetype: string;
  readonly reason: string;
}

/** One backend's published comparison. */
export interface ProfileBackend {
  readonly backend: ProfileBackendName;
  readonly headlineCount: number | null;
  readonly competitors: readonly string[];
  readonly sections: readonly ProfileSection[];
  readonly excluded: readonly ProfileExcluded[];
  /** CPU-time-only rows against WebGL1 arms, which report no structural counters. */
  readonly webgl1: readonly ProfileRow[];
}

/** One installed arm and the version that produced its numbers. */
export interface ProfileLibrary {
  readonly name: string;
  readonly version: string;
}

/** Rendering provenance for one backend. */
export interface RenderingStamp {
  readonly backend: ProfileBackendName;
  readonly adapter: string;
  readonly flags: readonly string[];
  readonly headless: boolean;
  readonly software: boolean;
  readonly slotTier?: number;
  readonly engineVersion: string;
  readonly timestamp: string;
}

/** Node and CPU host the physics numbers were measured on. */
export interface ProfileHost {
  readonly node: string;
  readonly cpu: string;
  readonly cpuCount: number;
  readonly os: string;
  readonly arch: string;
}

/** Physics provenance; physics has no backend axis, so there is one stamp. */
export interface PhysicsStamp {
  readonly host: ProfileHost;
  readonly fixedDelta: number;
  readonly caveats: readonly string[];
  readonly engineVersion: string;
  readonly timestamp: string;
}

/** One pooled rendering run's provenance. */
export interface RenderingRun {
  readonly provenance: readonly RenderingStamp[];
}

/** The rendering half of a document. */
export interface RenderingProfile {
  /** One entry per pooled run, in the order they were measured. */
  readonly runs: readonly RenderingRun[];
  readonly libraries: readonly ProfileLibrary[];
  readonly backends: readonly ProfileBackend[];
}

/** The physics half of a document. */
export interface PhysicsProfile {
  /** One stamp per pooled run, in the order they were measured. */
  readonly runs: readonly PhysicsStamp[];
  readonly libraries: readonly ProfileLibrary[];
  readonly section: ProfileSection;
}

/** The machine a document describes. */
export interface BenchProfile {
  readonly slug: string;
  readonly gpu: string;
  readonly os: string;
  readonly browser: string;
  readonly engineVersion: string;
  readonly measuredAt: string;
  /** How many separate harness runs every measured domain pools. */
  readonly runs: number;
}

/** Integrity cover the harness wrote over the document. */
export interface ProfileSignature {
  readonly algorithm: string;
  readonly value: string;
}

/**
 * A published machine-profile document.
 *
 * A domain is absent when the profile was written from a run that did not cover
 * it, and a missing domain means "not measured on this machine" - never zero.
 */
export interface BenchProfileDocument {
  readonly schemaVersion: number;
  readonly profile: BenchProfile;
  readonly rendering?: RenderingProfile;
  readonly physics?: PhysicsProfile;
  readonly signature: ProfileSignature;
}

const documents = import.meta.glob('../../../packages/exojs-bench/results/*.json', { eager: true, import: 'default' }) as Readonly<
  Record<string, BenchProfileDocument>
>;

/** Compare two dotted version strings, newest first. */
const byVersionDescending = (a: string, b: string): number => {
  const left = a.split('.');
  const right = b.split('.');

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = Number.parseInt(left[index] ?? '0', 10);
    const r = Number.parseInt(right[index] ?? '0', 10);

    if (Number.isNaN(l) || Number.isNaN(r)) return b.localeCompare(a);
    if (l !== r) return r - l;
  }

  return 0;
};

/** Newest engine version first, then newest measurement first. */
const byRecency = (a: BenchProfileDocument, b: BenchProfileDocument): number =>
  byVersionDescending(a.profile.engineVersion, b.profile.engineVersion) || b.profile.measuredAt.localeCompare(a.profile.measuredAt);

const loaded = Object.entries(documents)
  .map(([path, document]) => {
    if (document.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new Error(
        `Benchmark profile '${path}' declares schema version ${String(document.schemaVersion)}, but this site reads version ${String(SUPPORTED_SCHEMA_VERSION)}.`,
      );
    }

    return document;
  })
  .sort(byRecency);

/** Every published profile, newest engine version first and newest measurement first within a version. */
export const benchProfiles: readonly BenchProfileDocument[] = loaded;

/** The profile the page leads with, or `undefined` when nothing has been published yet. */
export const referenceProfile: BenchProfileDocument | undefined = loaded[0];

/** Every profile except the reference one, in the same order. Empty until a second machine is contributed. */
export const furtherProfiles: readonly BenchProfileDocument[] = loaded.slice(1);

/** Display name for a rendering backend. */
export const BACKEND_LABELS: Readonly<Record<ProfileBackendName, string>> = { webgl2: 'WebGL2', webgpu: 'WebGPU' };

/**
 * Spread factor at which a measurement's own noise is called out.
 *
 * The verdict ladder treats a ratio up to 1.2 between two arms as
 * indistinguishable from machine mood. A value whose own runs moved by that
 * much is therefore as noisy as the band that decides its verdict, which is the
 * point at which the reader has to know before reading the number. The
 * threshold is the ladder's, not a second opinion about what counts as noisy.
 */
export const WIDE_SPREAD_RATIO = 1.2;

/** A ratio in the form the verdict labels print it, or a dash when the pair produced none. */
export const formatFactor = (factor: number | null): string => (factor === null || !Number.isFinite(factor) ? '-' : `${factor.toFixed(2)}x`);

/** A median in milliseconds, or a dash when the arm produced no comparable number. */
export const formatMs = (ms: number | null): string => (ms === null || !Number.isFinite(ms) ? '-' : ms.toFixed(3));

/** An ISO timestamp reduced to a calendar day. */
export const formatDay = (timestamp: string): string => timestamp.slice(0, 10);

/**
 * An ISO timestamp reduced to the day and minute, in UTC.
 *
 * Runs pooled into one profile are usually minutes apart, so a day alone would
 * print the same value three times and hide that they are separate runs.
 */
export const formatRunTime = (timestamp: string): string => `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)} UTC`;

/** True when both ends of a spread were observed, so a range can be printed for it. */
export const hasSpread = (spread: ProfileSpread): boolean =>
  spread.minMs !== null && spread.maxMs !== null && Number.isFinite(spread.minMs) && Number.isFinite(spread.maxMs);

/** The observed range behind a pooled median, or an empty string when no run produced one. */
export const formatRange = (spread: ProfileSpread): string => (hasSpread(spread) ? `${formatMs(spread.minMs)}-${formatMs(spread.maxMs)}` : '');

/** True when the runs behind a value moved by at least {@link WIDE_SPREAD_RATIO}. */
export const isWideSpread = (spread: ProfileSpread): boolean => spread.ratio !== null && Number.isFinite(spread.ratio) && spread.ratio >= WIDE_SPREAD_RATIO;

/**
 * The word each ladder rung is printed with.
 *
 * An unstable cell publishes no verdict, so what its runs individually
 * concluded is the only evidence a reader has for how far apart they landed;
 * printing the raw rung ids would make that evidence unreadable.
 */
const RUNG_LABELS: Readonly<Record<string, string>> = {
  'not-comparable': 'not comparable',
  level: 'level',
  'exojs-leads': 'ExoJS leads',
  'exojs-leads-clearly': 'ExoJS leads clearly',
  'competitor-leads': 'the arm leads',
  'competitor-leads-clearly': 'the arm leads clearly',
};

/** What each run concluded, in run order, as a readable list. */
export const describeRungs = (rungs: readonly string[]): string =>
  rungs.map((rung, index) => `run ${String(index + 1)}: ${RUNG_LABELS[rung] ?? rung}`).join(', ');

/** True when this arm stands as a reference ceiling rather than as a peer. */
export const isWasmReferenceArm = (competitor: string): boolean => WASM_REFERENCE_ARMS.includes(competitor);

/**
 * The engine version of the newest published profile when `document` was
 * measured with an older one, otherwise `null` - the note a collapsed further
 * machine carries so its numbers are not read as current.
 */
export const olderThanReference = (document: BenchProfileDocument): string | null => {
  const newest = referenceProfile?.profile.engineVersion;

  return newest !== undefined && byVersionDescending(document.profile.engineVersion, newest) > 0 ? newest : null;
};

/** Arms a table has a column for, derived from the cells so an arm that produced nothing anywhere is not invented. */
export const armsOfSection = (section: ProfileSection): readonly string[] =>
  [...new Set(section.rows.flatMap(row => row.cells.map(cell => cell.competitor)))].sort();

/** One cell flattened onto its row, so a single comparison can be reasoned about on its own. */
interface FlatCell {
  readonly backend: ProfileBackendName | null;
  readonly archetype: string;
  readonly count: number;
  readonly cell: ProfileCell;
}

/**
 * Every rendering cell of the main tables.
 *
 * The WebGL1 block is deliberately left out. Those arms report no structural
 * counters, so their rows are an observation about a different backend
 * generation rather than a finding, and a headline sentence must not rest on one.
 */
const renderingCells = (document: BenchProfileDocument): readonly FlatCell[] =>
  (document.rendering?.backends ?? []).flatMap(backend =>
    backend.sections.flatMap(section =>
      section.rows.flatMap(row => row.cells.map(cell => ({ backend: backend.backend, archetype: row.archetype, count: row.count, cell }))),
    ),
  );

/** Every physics cell of the published table. */
const physicsCells = (document: BenchProfileDocument): readonly FlatCell[] =>
  (document.physics?.section.rows ?? []).flatMap(row => row.cells.map(cell => ({ backend: null, archetype: row.archetype, count: row.count, cell })));

/**
 * The cells a sentence may be built on: the ones whose pooled runs all reached
 * the same verdict.
 *
 * Every count, comparison and superlative below draws from this set and never
 * from the full one. An unstable cell's verdict is a placeholder whose `side` is
 * `neither`, so counting it as a row that "reads as level" would turn a
 * measurement the runs contradicted into a published claim - which is exactly
 * the laundering the stability rule exists to prevent.
 */
const settled = (cells: readonly FlatCell[]): readonly FlatCell[] => cells.filter(entry => entry.cell.aggregate.stable);

/** The cell with the widest computed factor, or `undefined` when none carries one. */
const widest = (cells: readonly FlatCell[]): FlatCell | undefined =>
  cells.reduce<FlatCell | undefined>((best, candidate) => {
    const factor = candidate.cell.verdict.factor;

    if (factor === null || !Number.isFinite(factor)) return best;

    const bestFactor = best?.cell.verdict.factor;

    return bestFactor === undefined || bestFactor === null || factor > bestFactor ? candidate : best;
  }, undefined);

/** Distinct arm names in a set of cells, alphabetically. */
const armsIn = (cells: readonly FlatCell[]): readonly string[] => [...new Set(cells.map(entry => entry.cell.competitor))].sort();

/** An English list: `a`, `a and b`, `a, b and c`. */
const listOf = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`);

/**
 * The arm whose numbers sit closest to ExoJS across the whole rendering table.
 *
 * Distance is the mean absolute log ratio, so a 2x lead and a 2x loss weigh the
 * same. Averaging the raw ratios would let one lopsided win cancel a loss and
 * name the wrong arm as the close one.
 *
 * Only cells whose runs agreed enter the mean. An unstable cell has no ratio the
 * measurement supports, so averaging one in would rank the arms partly on
 * numbers the runs contradicted; an arm with no settled cell at all is not
 * ranked rather than being placed last.
 */
const closestArm = (cells: readonly FlatCell[]): string | undefined => {
  const scored = armsIn(cells)
    .map(arm => {
      const ratios = cells
        .filter(entry => entry.cell.competitor === arm)
        .map(entry => entry.cell.verdict.ratio)
        .filter((ratio): ratio is number => ratio !== null && Number.isFinite(ratio) && ratio > 0);

      return { arm, ratios };
    })
    .filter(entry => entry.ratios.length > 0)
    .map(entry => ({ arm: entry.arm, distance: entry.ratios.reduce((sum, ratio) => sum + Math.abs(Math.log(ratio)), 0) / entry.ratios.length }));

  return scored.sort((a, b) => a.distance - b.distance)[0]?.arm;
};

/** How a headline sentence reads for the engine. */
export type FindingTone = 'scope' | 'lead' | 'level' | 'loss' | 'unstable';

/** One generated headline sentence. */
export interface HeadlineFinding {
  readonly tone: FindingTone;
  readonly text: string;
}

/** `n of m` where `m` counts only the comparisons a verdict could be drawn from. */
const outOfSettled = (count: number, total: number): string => `${String(count)} of ${String(total)}`;

/**
 * The page's headline paragraph, generated from a profile's own verdicts.
 *
 * Which rows deserve a sentence is decided here - the widest lead, the widest
 * loss, the arm that sits closest, the split against the pure-JS physics peers
 * and against the WASM ceiling. Every number and every verdict inside a sentence
 * is copied from the document, so a re-measurement rewrites the paragraph
 * instead of leaving prose behind that no longer matches the tables under it.
 *
 * No sentence is built on a cell whose pooled runs disagreed, and no denominator
 * counts one: a sentence that quietly folded unstable cells into its totals
 * would publish, in prose, the verdicts the tables above it refuse to print. How
 * many comparisons were left out that way is stated as a finding of its own,
 * because it is the reader's measure of how far the paragraph can be trusted.
 *
 * A sentence with nothing behind it is dropped rather than padded, so a profile
 * carrying only one domain yields a shorter paragraph.
 */
export const headlineFindings = (document: BenchProfileDocument): readonly HeadlineFinding[] => {
  const findings: HeadlineFinding[] = [];
  const allRendering = renderingCells(document);
  const allPhysics = physicsCells(document);
  const rendering = settled(allRendering);
  const physics = settled(allPhysics);
  const { profile } = document;
  const scopeParts: string[] = [];

  if (allRendering.length > 0) {
    const backends = (document.rendering?.backends ?? []).map(backend => BACKEND_LABELS[backend.backend]);

    scopeParts.push(`${String(allRendering.length)} rendering comparisons on ${listOf(backends)} against ${listOf(armsIn(allRendering))}`);
  }

  if (allPhysics.length > 0) {
    scopeParts.push(`${String(allPhysics.length)} physics comparisons against ${listOf(armsIn(allPhysics))}`);
  }

  if (scopeParts.length > 0) {
    findings.push({
      tone: 'scope',
      text: `The reference measurement runs ExoJS ${profile.engineVersion} on ${profile.gpu} / ${profile.os} / ${profile.browser}, pooled from ${String(profile.runs)} separate runs taken on ${formatDay(profile.measuredAt)}, and publishes ${scopeParts.join('; ')}.`,
    });
  }

  const unstableRendering = allRendering.length - rendering.length;
  const unstablePhysics = allPhysics.length - physics.length;

  if (unstableRendering > 0 || unstablePhysics > 0) {
    const parts = [
      ...(unstableRendering > 0 ? [`${outOfSettled(unstableRendering, allRendering.length)} rendering comparisons`] : []),
      ...(unstablePhysics > 0 ? [`${outOfSettled(unstablePhysics, allPhysics.length)} physics comparisons`] : []),
    ];

    findings.push({
      tone: 'unstable',
      text: `${listOf(parts)} came out differently in the ${String(profile.runs)} runs behind this profile, so they publish no verdict and none of the sentences here rests on one. They stay in the tables with the range their runs observed: on this machine those pairs are too close, or too noisy, to be separated.`,
    });
  }

  const clearLeads = rendering.filter(entry => entry.cell.verdict.side === 'exojs' && entry.cell.verdict.structural);
  const widestLead = widest(clearLeads);

  if (widestLead !== undefined && widestLead.backend !== null) {
    findings.push({
      tone: 'lead',
      text: `ExoJS leads clearly - five times or better - in ${outOfSettled(clearLeads.length, rendering.length)} rendering comparisons whose runs agreed, the widest being ${widestLead.archetype} on ${BACKEND_LABELS[widestLead.backend]} at ${formatFactor(widestLead.cell.verdict.factor)} ahead of ${widestLead.cell.competitor} with ${String(widestLead.count)} nodes.`,
    });
  }

  const closest = closestArm(rendering);

  if (closest !== undefined) {
    const against = rendering.filter(entry => entry.cell.competitor === closest);
    const level = against.filter(entry => entry.cell.verdict.side === 'neither').length;
    const ahead = against.filter(entry => entry.cell.verdict.side === 'exojs').length;
    const behind = against.filter(entry => entry.cell.verdict.side === 'competitor').length;
    const dropped = allRendering.filter(entry => entry.cell.competitor === closest).length - against.length;
    const caveat =
      dropped === 0 ? '' : ` A further ${String(dropped)} rows against that arm were not stable across the runs and are left out of this count entirely.`;
    // An arm every one of whose rows was unstable is not merely absent from the
    // ranking - it may well be the arm that actually sits closest, and naming
    // another one "closest" without saying so would be the ranking laundering
    // the instability it excluded.
    const unranked = armsIn(allRendering).filter(arm => !rendering.some(entry => entry.cell.competitor === arm));
    const missing =
      unranked.length === 0
        ? ''
        : ` ${listOf(unranked)} cannot be placed against that at all: no comparison against ${unranked.length === 1 ? 'it' : 'them'} was stable across the runs, so how close ${unranked.length === 1 ? 'it sits' : 'they sit'} is not something this profile measured.`;

    findings.push({
      tone: 'level',
      text: `Against ${closest}, the arm whose settled numbers sit closest to ExoJS, ${outOfSettled(level, against.length)} rows fall inside the 0.8-1.2 noise band and read as level, while ExoJS leads ${String(ahead)} and trails ${String(behind)}.${caveat}${missing}`,
    });
  }

  const widestLoss = widest(rendering.filter(entry => entry.cell.verdict.side === 'competitor'));

  if (widestLoss !== undefined && widestLoss.backend !== null) {
    const mechanism = widestLoss.cell.mechanism === null ? '' : ` The counters recorded for that row say: ${widestLoss.cell.mechanism}.`;

    findings.push({
      tone: 'loss',
      text: `The widest rendering loss the runs agreed on is ${widestLoss.archetype} on ${BACKEND_LABELS[widestLoss.backend]}, where ${widestLoss.cell.competitor} leads by ${formatFactor(widestLoss.cell.verdict.factor)}.${mechanism}`,
    });
  }

  const peers = physics.filter(entry => !isWasmReferenceArm(entry.cell.competitor));
  const peerLeads = peers.filter(entry => entry.cell.verdict.side === 'exojs');
  const widestPeerLead = widest(peerLeads);

  if (widestPeerLead !== undefined) {
    const behind = peers.filter(entry => entry.cell.verdict.side === 'competitor').length;

    findings.push({
      tone: 'lead',
      text: `In physics at ${String(widestPeerLead.count)} bodies, ExoJS leads the pure-JS peers (${listOf(armsIn(peers))}) in ${outOfSettled(peerLeads.length, peers.length)} comparisons whose runs agreed, by up to ${formatFactor(widestPeerLead.cell.verdict.factor)} against ${widestPeerLead.cell.competitor} on ${widestPeerLead.archetype}, and trails in ${String(behind)}.`,
    });
  }

  const ceiling = physics.filter(entry => isWasmReferenceArm(entry.cell.competitor));
  const ceilingLosses = ceiling.filter(entry => entry.cell.verdict.side === 'competitor');
  const widestCeilingLoss = widest(ceilingLosses);

  if (widestCeilingLoss !== undefined) {
    const level = ceiling.filter(entry => entry.cell.verdict.side === 'neither').length;

    findings.push({
      tone: 'loss',
      text: `Against ${listOf(armsIn(ceiling))}, a Rust/WASM engine published here as a ceiling rather than as a peer, ExoJS trails in ${outOfSettled(ceilingLosses.length, ceiling.length)} comparisons whose runs agreed - by up to ${formatFactor(widestCeilingLoss.cell.verdict.factor)} on ${widestCeilingLoss.archetype} - and is level in ${String(level)}.`,
    });
  }

  return findings;
};
