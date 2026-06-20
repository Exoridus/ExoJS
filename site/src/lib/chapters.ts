export interface ChapterMeta {
    slug: string;
    title: string;
    order: number;
    complexity: string;
}

export const CHAPTERS: ReadonlyArray<ChapterMeta> = [
    { order: 1, slug: 'getting-started', title: 'Getting Started', complexity: 'Trivial' },
    { order: 2, slug: 'application-scenes', title: 'Application & Scenes', complexity: 'Low' },
    { order: 3, slug: 'sprites-textures', title: 'Sprites & Textures', complexity: 'Low' },
    { order: 4, slug: 'tweens-animation', title: 'Tweens & Animation', complexity: 'Low' },
    { order: 5, slug: 'input', title: 'Input', complexity: 'Low' },
    { order: 6, slug: 'scene-graph', title: 'Scene Graph', complexity: 'Medium' },
    { order: 7, slug: 'audio-basics', title: 'Audio Basics', complexity: 'Low' },
    { order: 8, slug: 'spatial-audio', title: 'Spatial Audio', complexity: 'Medium' },
    { order: 9, slug: 'filters', title: 'Filters', complexity: 'High' },
    { order: 10, slug: 'particles', title: 'Particles', complexity: 'Medium' },
    { order: 11, slug: 'text-fonts', title: 'Text & Fonts', complexity: 'Low' },
    { order: 12, slug: 'geometry-graphics', title: 'Geometry & Graphics', complexity: 'High' },
    { order: 13, slug: 'render-targets', title: 'Render Targets', complexity: 'High' },
    { order: 14, slug: 'performance', title: 'Performance', complexity: 'Medium' },
    { order: 15, slug: 'audio-fx', title: 'Audio FX', complexity: 'Medium' },
    { order: 16, slug: 'beat-detection', title: 'Beat Detection', complexity: 'High' },
    { order: 17, slug: 'debug-layer', title: 'Debug Layer', complexity: 'Low' },
    { order: 18, slug: 'custom-renderers', title: 'Custom Renderers', complexity: 'Very high' },
    { order: 19, slug: 'showcase', title: 'Showcase', complexity: 'Mixed' },
    { order: 20, slug: 'ui', title: 'UI', complexity: 'Medium' },
];

export const CHAPTER_BY_SLUG = new Map(CHAPTERS.map(chapter => [chapter.slug, chapter]));
