import examplesCatalog from '../../../examples/examples.json';

export type Capability =
    | 'webgl2'
    | 'webgpu'
    | 'pointer'
    | 'keyboard'
    | 'gamepad'
    | 'touch'
    | 'audio'
    | 'fullscreen'
    | 'vibration'
    | 'offscreenCanvas'
    | 'webWorkers';

export interface CatalogEntry {
    slug: string;
    path: string;
    title: string;
    description: string;
    backend: string;
    capabilities?: Array<Capability>;
    tags?: Array<string>;
}

export type ExamplesCatalog = Record<string, Array<CatalogEntry>>;

export const EXAMPLES_CATALOG = examplesCatalog as ExamplesCatalog;

export const getExamplesForChapter = (chapterSlug: string): Array<CatalogEntry> => EXAMPLES_CATALOG[chapterSlug] ?? [];

export const getAllExamples = (): Array<CatalogEntry & { chapter: string }> =>
    Object.entries(EXAMPLES_CATALOG).flatMap(([chapter, entries]) => entries.map(entry => ({ ...entry, chapter })));
