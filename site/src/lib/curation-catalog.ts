import curation from '../../../docs/curation/catalog.json';
import { resolveExampleAlias } from './example-aliases';
import { getAllExamples, getRunnableExamples } from './examples-catalog';
import { buildPlaygroundNavModel } from './playground-nav';
import type { Example, ExamplesMap } from './types';

export const CURATED_SECTIONS = [
  { key: 'A', slug: 'start-here', title: 'First steps', order: 1 },
  { key: 'B', slug: 'sprites-cameras', title: 'Scene and camera', order: 2 },
  { key: 'C', slug: 'input-ui', title: 'Input and UI', order: 3 },
  { key: 'D', slug: 'animation-game-feel', title: 'Animation', order: 4 },
  { key: 'E', slug: 'graphics-text', title: 'Graphics and text', order: 5 },
  { key: 'F', slug: 'effects-rendering', title: 'Effects and media', order: 6 },
  { key: 'G', slug: 'lights-particles', title: 'Light and particles', order: 7 },
  { key: 'H', slug: 'audio', title: 'Audio', order: 8 },
  { key: 'I', slug: 'worlds-navigation', title: 'Tilemaps and navigation', order: 9 },
  { key: 'J', slug: 'physics-collision', title: 'Physics', order: 10 },
] as const;

const sourcePath = (source: string): string => source.replace(/^examples\//, '').replace(/\.ts$/, '.js');

export const getCuratedExamples = () => {
  const entries = new Map(getAllExamples().map(entry => [entry.path, entry]));

  return curation.targets.map(target => {
    const path = sourcePath(target.source);
    const entry = entries.get(path);
    const section = CURATED_SECTIONS.find(candidate => candidate.key === target.section);

    if (!entry || !section) {
      throw new Error(`Missing curated source or section: ${target.id}`);
    }

    return { ...entry, ...target, path, chapter: section.slug, section: section.slug };
  });
};

export const getPlaygroundNavigation = (): ExamplesMap => {
  const entries = getRunnableExamples()
    .filter(entry => resolveExampleAlias(entry.path) === entry.path)
    .map(entry => ({ ...entry, backend: entry.backend as Example['backend'], section: entry.chapter }));

  return new Map(buildPlaygroundNavModel(entries).map(category => [category.title, category.examples]));
};
