/**
 * The card model the benchmarks page is built from.
 *
 * A card is one scenario: the loads it was measured at, and for each load the
 * time every arm took. The page leads with these rather than with a table
 * because the question a reader arrives with is "how does ExoJS do on the work I
 * am about to do", and a table answers that only after they have learned how to
 * read it.
 *
 * Nothing here computes a timing or a verdict. The loads, their order and which
 * one opens a card are all decided by the harness before a run starts, and this
 * module only groups what the profile already carries - so no card can be
 * assembled to suit the numbers inside it.
 */

import type { BenchProfileDocument, LoadUnit, ProfileBackendName, ProfileCell, ProfileRow, ProfileSection } from './bench-profiles';
import { armLabel, formatLoad, isQuantitative, orderArms, outcomeOf, publishedMs, withheldScenario } from './bench-profiles';

/** One arm's time on one load of one scenario. */
export interface CardArm {
  /** Arm id, e.g. `pixi`. */
  readonly id: string;
  /** Human label, e.g. `PixiJS`. */
  readonly label: string;
  /** Milliseconds, or `null` where the arm published no figure here. */
  readonly ms: number | null;
  /** 95th percentile of the same window, or `null`. */
  readonly p95Ms: number | null;
  /** True when this arm is ExoJS itself rather than a competitor. */
  readonly reference: boolean;
  /** True when the figure is past a whole 60 fps frame. */
  readonly overFrameBudget: boolean;
  /** What the comparison this arm belongs to could establish; see `outcomeOf`. */
  readonly outcome: ReturnType<typeof outcomeOf>;
  /**
   * True where the figure may be drawn as a length.
   *
   * False is not a slow result but a comparison that was never drawn, so the
   * row keeps its words and loses its bar. Plotting one would give the arm that
   * produced nothing the shortest bar on the card, which reads as the fastest.
   */
  readonly quantitative: boolean;
}

/** One competitor's comparison on one load, for the detail a card opens. */
export interface CardComparison {
  /** Arm id, e.g. `pixi`. */
  readonly id: string;
  /** Human label, e.g. `PixiJS`. */
  readonly label: string;
  /** The published cell, verbatim - the detail and the row are the same measurement by construction. */
  readonly cell: ProfileCell;
  readonly outcome: ReturnType<typeof outcomeOf>;
}

/** One selectable load of one scenario. */
export interface CardLoad {
  /** Stable id within the scenario, used as the control's value. */
  readonly id: string;
  /** How the load reads beside the figures, e.g. `10,000 sprites`. */
  readonly label: string;
  /** Whether this is the load the card opens on. */
  readonly primary: boolean;
  /** ExoJS first, then the competitors in a fixed order; see `orderArms`. */
  readonly arms: readonly CardArm[];
  /** Largest plottable figure on this load, for scaling the bars. */
  readonly maxMs: number;
  /** Scene size this load was measured at. */
  readonly count: number;
  /** What `count` counts, where the row states one. */
  readonly unit?: LoadUnit;
  /** The published comparisons behind the row, in the same arm order. */
  readonly comparisons: readonly CardComparison[];
  /**
   * Why this load publishes no cross-arm comparison, or `undefined` where it
   * publishes one; see `withheldScenario`.
   *
   * A withheld load keeps every arm's time and loses every bar, factor and
   * winner: the arms ran the same scene and are not doing the same work in it,
   * which a bar length would assert they were.
   */
  readonly withheld: string | undefined;
  /**
   * How many libraries this load compares, where that is fewer than the block's
   * widest row; `null` where it compares all of them.
   *
   * A card that silently shows two rows where its neighbours show four reads as
   * a page that lost a library. The figure says how many were measured; why an
   * arm is missing is a property of that arm's adapter and coverage and stays
   * in the full results.
   */
  readonly measuredArms: number | null;
}

/** One scenario's card. */
export interface BenchCard {
  /** Archetype id - the card's identity and its anchor. */
  readonly id: string;
  /** The section the scenario is filed under. */
  readonly category: string;
  /** The rendering backend these loads were measured on; absent for physics, which has no backend axis. */
  readonly backend?: ProfileBackendName;
  /** Loads, in the order the harness measured them. */
  readonly loads: readonly CardLoad[];
}

/**
 * Scenarios the rendering section opens with, in this order.
 *
 * Chosen for the spread of work they represent - sprites moving, sprites still,
 * text changing, a large map scrolling, an effect running, clipping - and fixed
 * here rather than derived from the results, so the opening of the page cannot
 * become a selection of whatever ExoJS happened to win.
 */
export const RENDERING_HEADLINE_SCENARIOS: readonly string[] = [
  'dynamic-all',
  'static-heavy',
  'text-dynamic',
  'tilemap-scroll',
  'particles-lifecycle',
  'mask-clip',
];

/** Scenarios the physics section opens with, chosen on the same terms. */
export const PHYSICS_HEADLINE_SCENARIOS: readonly string[] = ['many-dynamic', 'box-stack', 'raycast', 'joints'];

/**
 * Fallback order for a profile that carries none of the headline scenarios -
 * an older measurement taken before they existed.
 *
 * A page that simply showed nothing there would report the absence of the
 * scenarios as an absence of results, so the section opens on whatever the
 * profile does carry, in its own order.
 */
const headlineOrFirst = (cards: readonly BenchCard[], preferred: readonly string[], count: number): readonly BenchCard[] => {
  const chosen = preferred.map(id => cards.find(card => card.id === id)).filter((card): card is BenchCard => card !== undefined);
  const taken = new Set(chosen.map(card => card.id));

  // Topped up in the profile's own order, never by result: an older profile
  // carries only some of the preferred scenarios, and a section that showed
  // three cards because three names happened to match would report the age of
  // the measurement as a shortage of tests.
  for (const card of cards) {
    if (chosen.length >= count) {
      break;
    }

    if (!taken.has(card.id)) {
      chosen.push(card);
      taken.add(card.id);
    }
  }

  return chosen;
};

/** ExoJS's own figure, which every cell of a row repeats because every pair shares it. */
const referenceArm = (cells: readonly ProfileCell[]): CardArm | null => {
  const first = cells[0];

  if (first === undefined) {
    return null;
  }

  return {
    id: 'exojs',
    label: armLabel('exojs'),
    ms: publishedMs(first, first.referenceMs),
    p95Ms: publishedMs(first, first.referenceP95Ms),
    reference: true,
    overFrameBudget: first.referenceOverFrameBudget,
    outcome: outcomeOf(first),
    // ExoJS's own figure belongs to every pair in the row, so it is plottable
    // as soon as any one of them drew a comparison. Reading it off the first
    // cell alone would hide the reference bar whenever the arm that happens to
    // sort first is the one the clock could not separate.
    quantitative: cells.some(cell => isQuantitative(outcomeOf(cell))),
  };
};

const competitorArm = (cell: ProfileCell): CardArm => ({
  id: cell.competitor,
  label: armLabel(cell.competitor),
  ms: publishedMs(cell, cell.competitorMs),
  p95Ms: publishedMs(cell, cell.competitorP95Ms),
  reference: false,
  overFrameBudget: cell.competitorOverFrameBudget,
  outcome: outcomeOf(cell),
  quantitative: isQuantitative(outcomeOf(cell)),
});

/** One row becomes one selectable load. */
const loadOf = (row: ProfileRow): CardLoad | null => {
  const reference = referenceArm(row.cells);

  if (reference === null) {
    return null;
  }

  const withheld = withheldScenario(row.archetype);
  const cells = orderArms(row.cells, cell => cell.competitor);
  // A withheld row loses its quantitative treatment wholesale rather than per
  // arm: the doubt is about the comparison, so no arm in it may keep a bar.
  const arms = [reference, ...cells.map(competitorArm)].map(arm => (withheld === undefined ? arm : { ...arm, quantitative: false }));
  // Every published figure sets the scale, because the bars are durations: an
  // arm whose PAIR the clock could not separate still took the time it reports,
  // and leaving it out of the maximum would draw it past the end of its track.
  // What is excluded is what was never published at all, which is already null.
  const plotted = arms.map(arm => arm.ms).filter((ms): ms is number => ms !== null && Number.isFinite(ms));

  return {
    id: row.loadId ?? String(row.count),
    label: formatLoad(row),
    primary: row.primary ?? false,
    arms,
    maxMs: plotted.length > 0 ? Math.max(...plotted) : 0,
    count: row.count,
    ...(row.unit !== undefined && { unit: row.unit }),
    comparisons: cells.map(cell => ({ id: cell.competitor, label: armLabel(cell.competitor), cell, outcome: outcomeOf(cell) })),
    measuredArms: null,
    withheld,
  };
};

/** Group a domain's sections into one card per scenario. */
const cardsOf = (sections: readonly ProfileSection[], backend?: ProfileBackendName): readonly BenchCard[] => {
  const byScenario = new Map<string, { category: string; loads: CardLoad[] }>();

  for (const section of sections) {
    for (const row of section.rows) {
      const load = loadOf(row);

      if (load === null) {
        continue;
      }

      const card = byScenario.get(row.archetype) ?? { category: section.title, loads: [] };

      card.loads.push(load);
      byScenario.set(row.archetype, card);
    }
  }

  // Marked against the widest row the same block published, not against a list
  // of arms the page holds: what a comparison "should" carry is whatever that
  // machine's run actually measured, and a profile taken against three arms
  // must not report every one of its rows as short of a fourth.
  const cards = [...byScenario.entries()].map(([id, card]) => ({ id, category: card.category, loads: card.loads, ...(backend !== undefined && { backend }) }));
  const widest = Math.max(0, ...cards.flatMap(card => card.loads.map(load => load.arms.length)));

  return cards.map(card => ({
    ...card,
    loads: card.loads.map(load => ({ ...load, measuredArms: load.arms.length < widest ? load.arms.length : null })),
  }));
};

/** The rendering cards of one profile on one backend, or an empty list where it measured none. */
export const renderingCards = (document: BenchProfileDocument, backend: ProfileBackendName): readonly BenchCard[] => {
  const block = document.rendering?.backends.find(entry => entry.backend === backend);

  return block === undefined ? [] : cardsOf(block.sections, backend);
};

/** The physics cards of one profile. Physics has no backend axis. */
export const physicsCards = (document: BenchProfileDocument): readonly BenchCard[] =>
  document.physics === undefined ? [] : cardsOf([document.physics.section]);

/**
 * How ExoJS stands on a card, as the ratio of the fastest measured peer to it.
 *
 * Above 1 ExoJS is ahead of even the quickest library measured beside it, below
 * 1 at least one is ahead of ExoJS. Read from the FASTEST peer rather than from
 * the field, so a single very slow arm cannot lift a card up the page, and from
 * the card's OPENING load only, so switching a load chip never reorders the
 * section under the reader's hands.
 *
 * `null` where the card publishes no comparison at all - a withheld row, or one
 * whose figures no comparison established. Those carry no standing to sort by
 * and keep the order the harness wrote them in.
 */
const standingOf = (card: BenchCard): number | null => {
  const load = openingLoad(card);

  if (load === undefined || load.withheld !== undefined) {
    return null;
  }

  const exojs = load.arms.find(arm => arm.reference);
  const peers = load.arms.filter(arm => !arm.reference && arm.quantitative && arm.ms !== null && arm.ms > 0).map(arm => arm.ms ?? 0);

  if (exojs === null || exojs === undefined || !exojs.quantitative || exojs.ms === null || exojs.ms <= 0 || peers.length === 0) {
    return null;
  }

  return Math.min(...peers) / exojs.ms;
};

/**
 * Cards ordered within one group, strongest standing first.
 *
 * Ordering only - no score is published, nothing is aggregated, and the groups
 * themselves keep the order the harness wrote them in, so a scenario never
 * leaves the category it belongs to. Cards that publish no comparison sort
 * after the ones that do, and ties keep the authored order.
 */
const byStanding = (cards: readonly BenchCard[]): readonly BenchCard[] =>
  cards
    .map((card, index) => ({ card, index, standing: standingOf(card) }))
    .sort((a, b) => {
      if (a.standing === null || b.standing === null) {
        return (a.standing === null ? 1 : 0) - (b.standing === null ? 1 : 0) || a.index - b.index;
      }

      return b.standing - a.standing || a.index - b.index;
    })
    .map(entry => entry.card);

/** The cards a section opens with, and the ones kept behind its "show all" control. */
export interface CardSelection {
  readonly headline: readonly BenchCard[];
  readonly rest: readonly BenchCard[];
}

/** Split a domain's cards into the fixed opening set and the remainder. */
export const selectCards = (cards: readonly BenchCard[], preferred: readonly string[], count: number): CardSelection => {
  const headline = headlineOrFirst(cards, preferred, count);
  const shown = new Set(headline.map(card => card.id));

  // Which cards open a section is fixed before any run; only their order within
  // the section follows the measurements.
  return { headline: byStanding(headline), rest: byStanding(cards.filter(card => !shown.has(card.id))) };
};

/** The load a card opens on: its headline, or the first one it carries. */
export const openingLoad = (card: BenchCard): CardLoad | undefined => card.loads.find(load => load.primary) ?? card.loads[0];
