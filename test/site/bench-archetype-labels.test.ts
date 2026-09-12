/**
 * Every scenario a published profile carries has to have a name and a sentence
 * on the benchmarks page.
 *
 * `archetypeTitle` falls back to the raw archetype id, which is a reasonable
 * thing for a renderer to do and a bad thing to ship: a row reading
 * `ui-layout-update` next to rows reading `Hit testing` and `Blur effect` looks
 * like a defect in the page rather than a label nobody wrote. The fallback stays
 * - the page must render a profile measured by a newer harness than it knows -
 * and this test is what stops the repository's own profiles reaching it.
 */

import { describe, expect, it } from 'vitest';

import { archetypeDescription, archetypeTitle, benchProfiles } from '../../site/src/lib/bench-profiles';

const publishedArchetypes = (): readonly string[] => [
  ...new Set(
    benchProfiles.flatMap(profile =>
      (profile.rendering?.backends ?? []).flatMap(backend => backend.sections.flatMap(section => section.rows.map(row => row.archetype))),
    ),
  ),
];

describe('benchmark page labels', () => {
  it('names every rendering scenario the published profiles carry', () => {
    expect(publishedArchetypes().filter(archetype => archetypeTitle(archetype) === archetype)).toStrictEqual([]);
  });

  it('describes every rendering scenario the published profiles carry', () => {
    expect(publishedArchetypes().filter(archetype => archetypeDescription(archetype) === undefined)).toStrictEqual([]);
  });
});
