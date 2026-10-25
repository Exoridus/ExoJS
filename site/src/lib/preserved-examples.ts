import type { CatalogEntry } from './examples-catalog';

export const PRESERVED_EXAMPLES: ReadonlyArray<CatalogEntry & { chapter: string }> = [
  {
    chapter: 'guide-fixtures',
    slug: 'application-loading',
    path: 'guide-fixtures/application-loading.js',
    title: 'Application Loader Signals',
    description: 'Observe application-owned loader progress, warm-cache navigation and scene signal cleanup.',
    backend: 'core',
    language: 'typescript',
    level: 'intermediate',
  },
  {
    chapter: 'guide-fixtures',
    slug: 'text-styles',
    path: 'guide-fixtures/text-styles.js',
    title: 'Font Styles and Decorations',
    description: 'Compare a loaded font with the system font and render gradients, outlines, underline and shadows.',
    backend: 'core',
    language: 'typescript',
    level: 'intermediate',
  },
  {
    chapter: 'guide-fixtures',
    slug: 'bitmap-layout',
    path: 'guide-fixtures/bitmap-layout.js',
    title: 'Bitmap Font Layout',
    description: 'Inspect prebuilt atlas glyphs, kerning, word wrapping and a live bitmap counter.',
    backend: 'core',
    language: 'typescript',
    level: 'intermediate',
  },
];
