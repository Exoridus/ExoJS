/**
 * What the benchmarks page may and may not print in place of a measurement.
 *
 * The failure this guards against shipped once: a physics arm the clock could
 * not separate stored a zero, and the card drew it as `0.00 ms` with a bar -
 * the fastest figure and the shortest bar on the page, for the arm that
 * produced nothing. The same cell's detail said `not comparable` at the same
 * moment, so the two views of one measurement disagreed in the reader's favour.
 *
 * These are about the published surface and not about the ladder: a comparison
 * that was never drawn must reach the page as words, a real measurement must
 * survive the formatter as a positive number, and both must say the same thing
 * wherever they appear.
 */

import { describe, expect, it } from 'vitest';

import { openingLoad, physicsCards, renderingCards } from '../../site/src/lib/bench-cards';
import { benchProfiles, formatMs, isQuantitative, outcomeOf, type ProfileCell, publishedMs, type TimerCheck } from '../../site/src/lib/bench-profiles';

/** A cell whose competitor arm reported `ms` under the given timer verdict. */
const cellOf = (ms: number, timer: TimerCheck, comparable = true): ProfileCell => ({
  competitor: 'nape-js',
  referenceMs: 5.24,
  referenceP95Ms: 6.1,
  referenceOverFrameBudget: false,
  competitorMs: ms,
  competitorP95Ms: ms,
  competitorOverFrameBudget: false,
  timer,
  verdict: comparable
    ? { side: 'competitor', ratio: 10, factor: 10, label: 'competitor leads clearly (10.00x)', structural: true }
    : { side: 'neither', ratio: null, factor: null, label: 'not comparable', structural: false },
  mechanism: null,
  aggregate: {
    runs: 3,
    reference: { minMs: 4.98, maxMs: 5.7, ratio: 1.14 },
    competitor: { minMs: ms, maxMs: ms, ratio: null },
    stable: true,
    rungs: ['not-comparable', 'not-comparable', 'not-comparable'],
  },
});

describe('a figure the comparison never established', () => {
  it('is withheld rather than published as a zero time', () => {
    const cell = cellOf(0, 'limited', false);

    expect(publishedMs(cell, cell.competitorMs)).toBeNull();
    expect(formatMs(publishedMs(cell, cell.competitorMs))).toBe('-');
  });

  it('is withheld even where the ladder did reach a factor from it', () => {
    // The harness can compute 23750x from a zero-ish sample; the timer check is
    // what says the two durations were never separated, and it outranks it.
    const cell = cellOf(0, 'limited');

    expect(outcomeOf(cell)).toBe('timer-limited');
    expect(publishedMs(cell, cell.competitorMs)).toBeNull();
  });

  it('gets no quantitative treatment on any of the three states that publish no comparison', () => {
    expect(isQuantitative('timer-limited')).toBe(false);
    expect(isQuantitative('timer-unknown')).toBe(false);
    expect(isQuantitative('absent')).toBe(false);
  });

  it('leaves a settled comparison quantitative, including one the runs disagreed on', () => {
    expect(isQuantitative('clear-loss')).toBe(true);
    expect(isQuantitative('unstable')).toBe(true);
  });
});

describe('a real measurement', () => {
  it('survives the timer check when the clock did separate it', () => {
    const cell = cellOf(0.42, 'resolved');

    expect(publishedMs(cell, cell.competitorMs)).toBe(0.42);
  });

  it('is never rounded down to a zero time', () => {
    expect(formatMs(0.0005)).toBe('0.001');
    expect(formatMs(0.0004)).toBe('<0.001');
    expect(formatMs(0.00001)).toBe('<0.001');
  });

  it('keeps a genuine zero apart from a value too small to print', () => {
    expect(formatMs(0)).toBe('0');
  });

  it('prints no digit the measurement does not fill', () => {
    expect(formatMs(0.14)).toBe('0.14');
    expect(formatMs(0.9)).toBe('0.9');
    expect(formatMs(5.8)).toBe('5.8');
    expect(formatMs(10)).toBe('10');
    expect(formatMs(186)).toBe('186');
  });
});

describe('every published profile', () => {
  const loads = benchProfiles
    .flatMap(document => [...(['webgl2', 'webgpu'] as const).flatMap(backend => renderingCards(document, backend)), ...physicsCards(document)])
    .flatMap(card => card.loads);

  it('publishes at least one load to check', () => {
    expect(loads.length).toBeGreaterThan(0);
  });

  it('publishes no arm at a zero time', () => {
    // A stored zero is an arm that sat the comparison out. Whatever else a card
    // does with it, it must never reach the page as the fastest figure on it.
    expect(loads.flatMap(load => load.arms).filter(arm => arm.ms === 0)).toStrictEqual([]);
  });

  it('scales a row by every published figure, so no bar runs past its track', () => {
    for (const load of loads) {
      const published = load.arms.map(arm => arm.ms).filter((ms): ms is number => ms !== null);

      expect(load.maxMs).toBe(published.length === 0 ? 0 : Math.max(...published));
    }
  });

  it('lists the arms of every load in the same fixed order', () => {
    for (const card of benchProfiles.flatMap(document => physicsCards(document))) {
      const order = card.loads.map(load => load.arms.map(arm => arm.id).join(','));

      expect(new Set(order).size).toBe(1);
      expect(order[0]?.startsWith('exojs')).toBe(true);
    }
  });

  it('opens every card on a load whose detail describes that same load', () => {
    for (const card of benchProfiles.flatMap(document => (['webgl2', 'webgpu'] as const).flatMap(backend => renderingCards(document, backend)))) {
      const opening = openingLoad(card);

      expect(opening).toBeDefined();
      // The detail is rendered from the load's own comparisons, so identity is
      // structural: every comparison the detail can show belongs to this load.
      expect(opening?.comparisons.map(entry => entry.id).sort()).toStrictEqual(
        opening?.arms
          .filter(arm => !arm.reference)
          .map(arm => arm.id)
          .sort(),
      );
    }
  });
});
