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

import type { BenchProfileDocument, ProfileBackendName, ProfileCell, ProfileRow, ProfileSection } from './bench-profiles';
import { armLabel, formatLoad, outcomeOf } from './bench-profiles';

/** One arm's time on one load of one scenario. */
export interface CardArm {
  /** Arm id, e.g. `pixi`. */
  readonly id: string;
  /** Human label, e.g. `PixiJS`. */
  readonly label: string;
  /** Milliseconds, or `null` where the arm produced no comparable figure. */
  readonly ms: number | null;
  /** 95th percentile of the same window, or `null`. */
  readonly p95Ms: number | null;
  /** True when this arm is ExoJS itself rather than a competitor. */
  readonly reference: boolean;
  /** True when the figure is past a whole 60 fps frame. */
  readonly overFrameBudget: boolean;
  /** What the comparison this arm belongs to could establish; see `outcomeOf`. */
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
  /** ExoJS first, then the competitors in the profile's own order. */
  readonly arms: readonly CardArm[];
  /** Largest measured figure on this load, for scaling the bars. */
  readonly maxMs: number;
}

/** One scenario's card. */
export interface BenchCard {
  /** Archetype id - the card's identity and its anchor. */
  readonly id: string;
  /** The section the scenario is filed under. */
  readonly category: string;
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
    ms: first.referenceMs,
    p95Ms: first.referenceP95Ms,
    reference: true,
    overFrameBudget: first.referenceOverFrameBudget,
    outcome: outcomeOf(first),
  };
};

const competitorArm = (cell: ProfileCell): CardArm => ({
  id: cell.competitor,
  label: armLabel(cell.competitor),
  ms: cell.competitorMs,
  p95Ms: cell.competitorP95Ms,
  reference: false,
  overFrameBudget: cell.competitorOverFrameBudget,
  outcome: outcomeOf(cell),
});

/** One row becomes one selectable load. */
const loadOf = (row: ProfileRow): CardLoad | null => {
  const reference = referenceArm(row.cells);

  if (reference === null) {
    return null;
  }

  const arms = [reference, ...row.cells.map(competitorArm)];
  const measured = arms.map(arm => arm.ms).filter((ms): ms is number => ms !== null && Number.isFinite(ms));

  return {
    id: row.loadId ?? String(row.count),
    label: formatLoad(row),
    primary: row.primary ?? false,
    arms,
    maxMs: measured.length > 0 ? Math.max(...measured) : 0,
  };
};

/** Group a domain's sections into one card per scenario. */
const cardsOf = (sections: readonly ProfileSection[]): readonly BenchCard[] => {
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

  return [...byScenario.entries()].map(([id, card]) => ({ id, category: card.category, loads: card.loads }));
};

/** The rendering cards of one profile on one backend, or an empty list where it measured none. */
export const renderingCards = (document: BenchProfileDocument, backend: ProfileBackendName): readonly BenchCard[] => {
  const block = document.rendering?.backends.find(entry => entry.backend === backend);

  return block === undefined ? [] : cardsOf(block.sections);
};

/** The physics cards of one profile. Physics has no backend axis. */
export const physicsCards = (document: BenchProfileDocument): readonly BenchCard[] =>
  document.physics === undefined ? [] : cardsOf([document.physics.section]);

/** The cards a section opens with, and the ones kept behind its "show all" control. */
export interface CardSelection {
  readonly headline: readonly BenchCard[];
  readonly rest: readonly BenchCard[];
}

/** Split a domain's cards into the fixed opening set and the remainder. */
export const selectCards = (cards: readonly BenchCard[], preferred: readonly string[], count: number): CardSelection => {
  const headline = headlineOrFirst(cards, preferred, count);
  const shown = new Set(headline.map(card => card.id));

  return { headline, rest: cards.filter(card => !shown.has(card.id)) };
};

/** The load a card opens on: its headline, or the first one it carries. */
export const openingLoad = (card: BenchCard): CardLoad | undefined => card.loads.find(load => load.primary) ?? card.loads[0];
