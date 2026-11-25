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

// A small tour of existing catalog entries. Titles, instructions, categories
// and availability continue to belong to the loaded catalog version.
const PLAYGROUND_HIGHLIGHT_PATHS = [
  'physics/sprite-follows-body.js',
  'tweens-animation/tween-basics.js',
  'filters/custom-fragment-shader.js',
  'showcase/boss-intro-cinematic.js',
] as const;

export const getPlaygroundHighlights = (examples: readonly Example[]): Example[] =>
  PLAYGROUND_HIGHLIGHT_PATHS.flatMap(path => {
    const example = examples.find(entry => entry.path === path && entry.featured !== false);

    return example ? [example] : [];
  });

export const getPlaygroundDefault = (examples: readonly Example[]): Example | null =>
  getPlaygroundHighlights(examples)[0] ?? examples[0] ?? null;

export const getNextPlaygroundHighlight = (examples: readonly Example[], currentPath: string): Example | null => {
  const highlights = getPlaygroundHighlights(examples);
  const currentIndex = highlights.findIndex(example => example.path === currentPath);
  const next = highlights[(currentIndex + 1) % highlights.length] ?? null;

  return next?.path === currentPath ? null : next;
};

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
