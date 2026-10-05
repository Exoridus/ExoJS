export interface PlaygroundCategory {
  slug: string;
  title: string;
  order: number;
}

export const PLAYGROUND_CATEGORIES: ReadonlyArray<PlaygroundCategory> = [
  { slug: 'start-here', title: 'Start here', order: 1 },
  { slug: 'scenes-assets', title: 'Scenes & assets', order: 2 },
  { slug: 'input-ui', title: 'Input & UI', order: 3 },
  { slug: 'sprites-cameras', title: 'Sprites & cameras', order: 4 },
  { slug: 'animation-game-feel', title: 'Animation & game feel', order: 5 },
  { slug: 'graphics-text', title: 'Graphics & text', order: 6 },
  { slug: 'effects-rendering', title: 'Effects & rendering', order: 7 },
  { slug: 'lighting', title: 'Lighting', order: 8 },
  { slug: 'particles', title: 'Particles', order: 9 },
  { slug: 'audio', title: 'Audio', order: 10 },
  { slug: 'worlds-navigation', title: 'Worlds & navigation', order: 11 },
  { slug: 'physics-collision', title: 'Physics & collision', order: 12 },
  { slug: 'performance-diagnostics', title: 'Performance & diagnostics', order: 13 },
];

export const PLAYGROUND_CATEGORY_BY_SLUG = new Map(PLAYGROUND_CATEGORIES.map(category => [category.slug, category]));
