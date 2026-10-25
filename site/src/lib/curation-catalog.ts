import curation from '../../../docs/curation/catalog.json';
import { getAllExamples, getRunnableExamples } from './examples-catalog';
import { PRESERVED_EXAMPLES } from './preserved-examples';
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

export const CURATED_CATEGORY_BY_SLUG = new Map(CURATED_SECTIONS.map(section => [section.slug, section]));

export const CURATION_READY =
  curation.targets.length === 48 &&
  curation.contracts.length === 111 &&
  curation.targets.every(target => target.status === 'accepted') &&
  curation.contracts.every(contract => contract.migration === 'verified');

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

export const getPreservationEntries = () => {
  const entries = new Map(getRunnableExamples().map(entry => [entry.path, entry]));
  const tools = new Set(['debug-layer/asset-browser.js', 'input/gamepad.js']);
  const retained = curation.contracts
    .filter(contract => contract.disposition === 'merge' || contract.disposition === 'guide-tool-test')
    .map(contract => {
      const path = sourcePath(contract.source);
      const entry = entries.get(path);

      if (!entry) {
        throw new Error(`Missing runnable preservation source: ${path}`);
      }

      const target = curation.targets.find(candidate => candidate.id === contract.target);
      let kind = 'guide';

      if (contract.disposition === 'merge') {
        kind = 'merge';
      } else if (tools.has(path)) {
        kind = 'tool';
      } else if (contract.target.startsWith('diagnostic-')) {
        kind = 'diagnostic';
      }

      return { ...entry, kind, targetPath: target ? sourcePath(target.source) : undefined };
    });

  return [...retained, ...PRESERVED_EXAMPLES.map(entry => ({ ...entry, kind: 'guide', targetPath: undefined }))];
};

export const getCuratedNavigation = (): ExamplesMap => {
  const entries = getCuratedExamples();

  return new Map(
    CURATED_SECTIONS.map(section => [
      section.title,
      entries
        .filter(entry => entry.section === section.slug)
        .map(entry => ({ ...entry, backend: entry.backend as Example['backend'], order: entry.number })),
    ]),
  );
};
