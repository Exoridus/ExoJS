/**
 * Guide information architecture — the single source of truth for guide
 * ordering, grouping, learning metadata, and cross-references (playground
 * examples and API pages).
 *
 * Per-chapter prose (title, description) lives in the MDX frontmatter so it
 * stays next to the content it describes. This module owns everything that the
 * navigation, landing page, and learning path need without parsing MDX:
 *   - part grouping and order
 *   - chapter order within a part (chapter numbers are positional)
 *   - level, learning goals, and prerequisites
 *   - related playground examples ("<category>/<slug>")
 *   - related API pages (API slugs, resolved against site/src/content/api)
 *
 * Chapter numbers are derived from array position, so reordering a part never
 * requires renumbering titles by hand. A node test reconciles this module with
 * the MDX files (every chapter has a file, no orphans) and validates every
 * cross-reference, so a typo fails the test suite rather than shipping a dead
 * link.
 */

export type GuideLevel = 'intro' | 'intermediate' | 'advanced';

export const GUIDE_LEVELS: ReadonlyArray<GuideLevel> = ['intro', 'intermediate', 'advanced'];

export const GUIDE_LEVEL_LABEL: Record<GuideLevel, string> = {
    intro: 'Intro',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
};

/** Authoring shape — only the fields a chapter actually sets. */
interface RawChapter {
    slug: string;
    level: GuideLevel;
    /** Concrete, scannable outcomes. Set on the core onboarding chapters. */
    learningGoals?: ReadonlyArray<string>;
    /** Guide paths ("<partSlug>/<chapterSlug>") the reader should do first. */
    prerequisites?: ReadonlyArray<string>;
    /** Related playground examples as "<category>/<slug>". */
    examples?: ReadonlyArray<string>;
    /** Related API pages as content slugs under site/src/content/api. */
    apiLinks?: ReadonlyArray<string>;
}

interface RawPart {
    slug: string;
    title: string;
    description: string;
    chapters: ReadonlyArray<RawChapter>;
}

export interface GuideChapterMeta {
    part: number;
    chapter: number;
    partSlug: string;
    partTitle: string;
    slug: string;
    path: string;
    level: GuideLevel;
    learningGoals: ReadonlyArray<string>;
    prerequisites: ReadonlyArray<string>;
    examples: ReadonlyArray<string>;
    apiLinks: ReadonlyArray<string>;
}

export interface GuidePartMeta {
    part: number;
    slug: string;
    title: string;
    description: string;
    chapters: ReadonlyArray<GuideChapterMeta>;
}

const RAW_PARTS: ReadonlyArray<RawPart> = [
    {
        slug: 'getting-started',
        title: 'Getting Started',
        description: 'Understand what ExoJS is, create a project, and render your first scene.',
        chapters: [
            {
                slug: 'what-is-exojs',
                level: 'intro',
                learningGoals: [
                    'know what ExoJS is and the kind of projects it targets',
                    'recognise where ExoJS fits next to your UI framework',
                    'know how the guide, playground, and API reference work together',
                ],
                apiLinks: ['application', 'scene'],
            },
            {
                slug: 'setup',
                level: 'intro',
                learningGoals: [
                    'create a typed project with create-exo-app',
                    'choose between the minimal, game-starter, and audio-reactive templates',
                    'run the dev server and a production build',
                ],
                prerequisites: ['getting-started/what-is-exojs'],
                apiLinks: ['application'],
            },
            {
                slug: 'project-structure',
                level: 'intro',
                learningGoals: [
                    'find your way around a create-exo-app project',
                    'know where the entry point, scenes, and assets live',
                    'understand how main.ts wires an Application to a Scene',
                ],
                prerequisites: ['getting-started/setup'],
                examples: ['getting-started/hello-world'],
                apiLinks: ['application', 'scene'],
            },
            {
                slug: 'your-first-scene',
                level: 'intro',
                learningGoals: [
                    'load a texture and draw a sprite',
                    'center a sprite with an anchor',
                    'animate state each frame with delta time',
                ],
                prerequisites: ['getting-started/setup'],
                examples: ['getting-started/hello-world'],
                apiLinks: ['application', 'scene', 'sprite', 'texture', 'loader'],
            },
            {
                slug: 'resize-dpr-and-canvas',
                level: 'intro',
                learningGoals: [
                    'fit the canvas to its container with app.resize',
                    'render crisply on high-DPI displays with pixelRatio',
                    're-lay-out content when the size changes',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: ['getting-started/resize-and-dpr'],
                apiLinks: ['application'],
            },
        ],
    },
    {
        slug: 'runtime',
        title: 'Runtime',
        description: 'The runtime model most ExoJS projects rely on: applications, scenes, the frame loop, and coordinates.',
        chapters: [
            {
                slug: 'application',
                level: 'intro',
                learningGoals: [
                    'create and configure an Application',
                    'understand how the application owns canvas, sizing, and the frame loop',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: ['getting-started/hello-world', 'getting-started/resize-and-dpr'],
                apiLinks: ['application'],
            },
            {
                slug: 'scenes-and-lifecycle',
                level: 'intro',
                learningGoals: [
                    'split a project into focused scenes and switch between them at runtime',
                    'order work across load, init, update, and draw',
                    'separate state updates from rendering',
                    'release resources in destroy',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: [
                    'application-scenes/multiple-scenes',
                    'application-scenes/scene-lifecycle',
                    'application-scenes/pause-and-resume',
                    'getting-started/game-loop',
                ],
                apiLinks: ['scene', 'loader', 'time'],
            },
            {
                slug: 'scene-graph',
                level: 'intermediate',
                learningGoals: [
                    'compose drawables with containers',
                    'reason about transforms, draw order, and masks',
                ],
                prerequisites: ['runtime/scenes-and-lifecycle'],
                examples: [
                    'scene-graph/containers',
                    'scene-graph/nested-transforms',
                    'scene-graph/local-vs-global-transform',
                    'scene-graph/pivot-and-anchor',
                    'scene-graph/z-ordering',
                    'scene-graph/masks',
                ],
                apiLinks: ['container', 'drawable'],
            },
            {
                slug: 'coordinates-and-views',
                level: 'intermediate',
                learningGoals: [
                    'map world space to screen space',
                    'move and zoom a camera view',
                ],
                prerequisites: ['runtime/scene-graph'],
                examples: [
                    'application-scenes/camera-and-view',
                    'application-scenes/multi-view-split-screen',
                    'application-scenes/picture-in-picture',
                    'application-scenes/world-vs-screen-coords',
                ],
                apiLinks: ['view', 'camera'],
            },
            {
                slug: 'ui-and-widgets',
                level: 'intermediate',
                learningGoals: [
                    'build a screen-fixed HUD and menus on scene.ui',
                    'compose Panel, Button, Label, and ProgressBar widgets',
                    'anchor and stack widgets, and route clicks and keyboard focus',
                ],
                prerequisites: ['runtime/scenes-and-lifecycle'],
                examples: ['ui/hud-and-widgets', 'application-scenes/hud-overlay-scene'],
                apiLinks: ['uiroot', 'widget', 'button', 'panel', 'label', 'progress-bar', 'focus-manager'],
            },
            {
                slug: 'serialization-and-prefabs',
                level: 'advanced',
                learningGoals: [
                    'serialize a scene to JSON and restore it',
                    'capture reusable prefabs and instantiate many independent copies',
                    'persist save slots with SaveManager and register serializers for custom node types',
                ],
                prerequisites: ['runtime/scene-graph'],
                apiLinks: ['scene', 'prefab', 'save-manager', 'serialization-registry', 'scene-node'],
            },
        ],
    },
    {
        slug: 'assets',
        title: 'Assets',
        description: 'Declare, load, and access textures, audio, and data with a predictable resource pipeline.',
        chapters: [
            {
                slug: 'loading-and-resources',
                level: 'intermediate',
                learningGoals: [
                    'declare and load assets predictably',
                    'access loaded resources by name',
                ],
                prerequisites: ['runtime/scenes-and-lifecycle'],
                examples: ['sprites-textures/texture-loader'],
                apiLinks: ['loader', 'texture'],
            },
            {
                slug: 'tiled-maps',
                level: 'intermediate',
                learningGoals: [
                    'activate the official Tiled extension explicitly or via /register',
                    'load a .tmj map through the loader and read its layers and tilesets',
                    'understand tileset texture ownership and the supported format scope',
                ],
                prerequisites: ['assets/loading-and-resources'],
                apiLinks: ['loader'],
            },
        ],
    },
    {
        slug: 'rendering',
        title: 'Rendering',
        description: 'Build a scene with shapes, sprites, text, animation, and render targets.',
        chapters: [
            {
                slug: 'graphics',
                level: 'intro',
                learningGoals: [
                    'draw procedural shapes with Graphics',
                    'fill, stroke, and position drawn geometry',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: [
                    'geometry-graphics/graphics-primitives',
                    'geometry-graphics/infinite-grid',
                    'geometry-graphics/mesh-triangle',
                    'geometry-graphics/mesh-textured-quad',
                    'geometry-graphics/mesh-deformed-grid',
                ],
                apiLinks: ['graphics', 'color'],
            },
            {
                slug: 'sprites',
                level: 'intro',
                learningGoals: [
                    'render textures, sheets, SVG, and video as sprites',
                    'control anchor, blend mode, and frames',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: [
                    'sprites-textures/sprite-basics',
                    'sprites-textures/blendmodes',
                    'sprites-textures/spritesheet-frames',
                    'sprites-textures/svg-drawable',
                    'sprites-textures/video-drawable',
                ],
                apiLinks: ['sprite', 'spritesheet', 'texture'],
            },
            {
                slug: 'text',
                level: 'intro',
                learningGoals: [
                    'render and style runtime text',
                    'lay out multiline and wrapped text',
                ],
                examples: [
                    'text-fonts/basic-text',
                    'text-fonts/multiline-and-wrap',
                    'text-fonts/stroke-and-shadow',
                    'text-fonts/web-fonts',
                    'text-fonts/text-glitch',
                ],
                apiLinks: ['text', 'bitmap-text', 'text-style'],
            },
            {
                slug: 'animation',
                level: 'intermediate',
                learningGoals: [
                    'tween transforms and values over time',
                    'chain, yoyo, and interrupt tweens',
                ],
                examples: [
                    'tweens-animation/easing-curves',
                    'tweens-animation/frame-animation',
                    'tweens-animation/interrupt-and-replace',
                    'tweens-animation/tween-basics',
                    'tweens-animation/tween-chains',
                    'tweens-animation/tween-from-array',
                    'tweens-animation/tween-with-yoyo',
                ],
                apiLinks: ['tween', 'tween-manager', 'animated-sprite'],
            },
            {
                slug: 'render-targets',
                level: 'advanced',
                learningGoals: [
                    'render a scene into an intermediate texture',
                    'reuse render-target output in composition',
                ],
                prerequisites: ['rendering/sprites'],
                examples: ['render-targets/render-to-texture', 'render-targets/mini-map'],
                apiLinks: ['render-target', 'render-texture'],
            },
            {
                slug: 'pixel-snapping',
                level: 'intermediate',
                learningGoals: [
                    'snap rendered sprites, panels, and tilemaps to the device-pixel grid',
                    'choose between position and geometry snapping',
                    'rely on the render-only contract: logical state never changes',
                ],
                prerequisites: ['rendering/sprites'],
                apiLinks: ['drawable', 'sprite', 'view'],
            },
        ],
    },
    {
        slug: 'effects',
        title: 'Effects',
        description: 'Layer filters, particles, post-processing, and custom shaders for mood and motion.',
        chapters: [
            {
                slug: 'filters',
                level: 'intermediate',
                examples: [
                    'filters/blur-filter',
                    'filters/chromatic-aberration',
                    'filters/color-filter',
                    'filters/crt-scanlines',
                    'filters/custom-fragment-shader',
                    'filters/filter-stack',
                    'filters/metaballs',
                    'filters/noise-vignette',
                    'filters/palette-cycling',
                    'showcase/color-grading',
                ],
                apiLinks: ['filter', 'color-filter', 'blur-filter'],
            },
            {
                slug: 'particles',
                level: 'intermediate',
                examples: [
                    'particles/emitter-basics',
                    'particles/bonfire',
                    'particles/fireworks',
                    'particles/cursor-attractor-particles',
                    'particles/gpu-particles',
                    'particles/custom-wgsl-module',
                ],
                apiLinks: [],
            },
            {
                slug: 'post-processing',
                level: 'advanced',
                prerequisites: ['rendering/render-targets'],
                examples: [
                    'render-targets/bloom-lite',
                    'render-targets/post-processing-chain',
                    'render-targets/trail-feedback',
                    'render-targets/water-mirror',
                ],
                apiLinks: ['render-target', 'filter'],
            },
            {
                slug: 'custom-mesh-shaders',
                level: 'advanced',
                prerequisites: ['rendering/graphics'],
                examples: ['geometry-graphics/mesh-triangle', 'geometry-graphics/mesh-textured-quad', 'geometry-graphics/mesh-deformed-grid'],
                apiLinks: ['mesh'],
            },
        ],
    },
    {
        slug: 'input',
        title: 'Input',
        description: 'Handle keyboard, pointer, touch, and gamepad with predictable input flow.',
        chapters: [
            {
                slug: 'keyboard-and-actions',
                level: 'intro',
                learningGoals: [
                    'capture keys with scene-scoped bindings',
                    'handle taps, holds, and rebinding',
                    'map several devices to one intent',
                    'keep gameplay code device-agnostic',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: ['input/keyboard', 'input/key-rebinding', 'input/action-mapping'],
                apiLinks: ['keyboard', 'input-manager'],
            },
            {
                slug: 'mouse-and-pointer',
                level: 'intro',
                learningGoals: [
                    'read unified pointer events across mouse and touch',
                    'translate pointer position into world space',
                ],
                prerequisites: ['input/keyboard-and-actions'],
                examples: ['input/mouse-and-pointer', 'input/multitouch', 'input/pointer-to-world'],
                apiLinks: ['pointer', 'input-manager'],
            },
            {
                slug: 'gamepad',
                level: 'intermediate',
                learningGoals: [
                    'read controller buttons and axes',
                    'support multiple connected gamepads',
                ],
                prerequisites: ['input/keyboard-and-actions'],
                examples: ['input/gamepad', 'input/multi-gamepad'],
                apiLinks: ['gamepad', 'input-manager'],
            },
        ],
    },
    {
        slug: 'audio',
        title: 'Audio',
        description: 'Play sound and music, place it in space, shape it with effects, and react to it.',
        chapters: [
            {
                slug: 'audio-basics',
                level: 'intro',
                learningGoals: [
                    'load and play Sound and AudioStream',
                    'control volume, looping, and fades',
                    'handle the browser autoplay gesture',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: [
                    'audio-basics/play-sound',
                    'audio-basics/music-loop',
                    'audio-basics/crossfade-tracks',
                    'audio-basics/sound-pool',
                    'audio-basics/random-pitch-pool',
                    'audio-basics/audio-buses',
                ],
                apiLinks: ['sound', 'audio-stream', 'audio-manager'],
            },
            {
                slug: 'spatial-audio',
                level: 'intermediate',
                learningGoals: [
                    'place a listener and sources in space',
                    'tune directional falloff',
                ],
                prerequisites: ['audio/audio-basics'],
                examples: ['spatial-audio/listener-and-source', 'spatial-audio/moving-source', 'spatial-audio/falloff-curves'],
                apiLinks: ['audio-listener', 'audio-manager'],
            },
            {
                slug: 'audio-effects',
                level: 'intermediate',
                learningGoals: [
                    'shape sound with bus and per-voice effects',
                    'apply reverb, delay, and ducking',
                ],
                prerequisites: ['audio/audio-basics'],
                examples: ['audio-fx/compressor', 'audio-fx/ducking', 'audio-fx/reverb-and-delay', 'audio-fx/vocoder'],
                apiLinks: ['audio-bus', 'audio-effect'],
            },
            {
                slug: 'beat-detection',
                level: 'intermediate',
                learningGoals: [
                    'read beat and frequency information',
                    'drive timing from audio analysis',
                ],
                prerequisites: ['audio/audio-basics'],
                examples: ['beat-detection/beat-sync-pulse', 'beat-detection/frequency-bands', 'beat-detection/tempo-tracking'],
                apiLinks: ['beat-detector', 'audio-analyser'],
            },
            {
                slug: 'audio-reactive-visualization',
                level: 'intermediate',
                learningGoals: [
                    'map audio analysis to visuals',
                    'build a responsive audio-reactive scene',
                ],
                prerequisites: ['audio/beat-detection'],
                examples: ['showcase/audio-visualisation', 'showcase/audio-reactive-particles'],
                apiLinks: ['audio-analyser', 'beat-detector'],
            },
        ],
    },
    {
        slug: 'recipes',
        title: 'Recipes',
        description: 'Practical scene patterns you can adapt directly, ending with a complete small game.',
        chapters: [
            {
                slug: 'hud-overlay',
                level: 'intermediate',
                examples: ['application-scenes/hud-overlay-scene', 'showcase/minimap-with-mask'],
            },
            {
                slug: 'camera-follow-and-parallax',
                level: 'intermediate',
                examples: ['showcase/mouse-parallax', 'scene-graph/parallax-starfield'],
            },
            {
                slug: 'pause-menu',
                level: 'intermediate',
                examples: ['showcase/pause-blur'],
            },
            {
                slug: 'split-screen',
                level: 'intermediate',
                examples: ['application-scenes/multi-view-split-screen'],
            },
            {
                slug: 'audio-reactive-scene',
                level: 'intermediate',
                examples: ['showcase/audio-reactive-particles', 'showcase/audio-visualisation', 'showcase/low-band-camera-shake', 'showcase/vinyl-record'],
            },
            {
                slug: 'game-feel',
                level: 'intermediate',
                examples: ['showcase/damage-flash', 'showcase/screen-shake-on-explosion', 'showcase/gamepad-spaceship'],
            },
            {
                slug: 'ui-patterns',
                level: 'intermediate',
                examples: ['showcase/dialog-system', 'showcase/typewriter-text'],
            },
            {
                slug: 'cinematics',
                level: 'intermediate',
                examples: ['showcase/boss-intro-cinematic'],
            },
            {
                slug: 'gameplay-collision',
                level: 'advanced',
                examples: ['showcase/rectangles-collision'],
                apiLinks: ['bounds', 'circle'],
            },
            {
                slug: 'build-orb-dodge',
                level: 'intermediate',
                learningGoals: [
                    'wire a complete game from scenes, input, and graphics',
                    'spawn, move, and collide objects each frame',
                    'transition to a game-over scene and restart',
                ],
                prerequisites: ['runtime/scenes-and-lifecycle', 'input/keyboard-and-actions', 'rendering/graphics'],
                examples: ['showcase/orb-dodge'],
                apiLinks: ['scene', 'graphics', 'keyboard', 'text', 'color'],
            },
        ],
    },
    {
        slug: 'debugging',
        title: 'Debugging & Performance',
        description: 'Inspect a running scene, profile it, debug the render pipeline, choose a backend, and extend the renderer.',
        chapters: [
            {
                slug: 'debugging-and-inspection',
                level: 'intermediate',
                learningGoals: [
                    'overlay performance, bounds, and hit-test layers',
                    'toggle debug layers without changing scene code',
                    'inspect filter chains and render-pass counts',
                ],
                prerequisites: ['getting-started/your-first-scene'],
                examples: [
                    'debug-layer/performance-overlay',
                    'debug-layer/bounding-boxes',
                    'debug-layer/pointer-and-hittest',
                    'debug-layer/signal-bus-inspector',
                    'render-targets/post-processing-chain',
                    'render-targets/bloom-lite',
                ],
                apiLinks: ['debug-overlay', 'performance-layer', 'bounding-boxes-layer', 'hit-test-layer', 'render-pass-inspector-layer'],
            },
            {
                slug: 'performance',
                level: 'intermediate',
                learningGoals: [
                    'measure scene limits with stress examples',
                    'read the performance overlay to find bottlenecks',
                ],
                prerequisites: ['debugging/debugging-and-inspection'],
                examples: ['performance/sprite-stress', 'performance/multi-texture-stress', 'performance/particle-stress'],
                apiLinks: ['performance-layer'],
            },
            {
                slug: 'backend-comparison',
                level: 'advanced',
                examples: ['performance/backend-comparison'],
                apiLinks: ['capabilities'],
            },
            {
                slug: 'custom-renderers',
                level: 'advanced',
                examples: ['custom-renderers/custom-render-pass', 'custom-renderers/custom-triangle-renderer'],
            },
        ],
    },
    {
        slug: 'shipping',
        title: 'Shipping',
        description: 'Ship an ExoJS app to production, diagnose common problems, and upgrade across versions.',
        chapters: [
            {
                slug: 'troubleshooting',
                level: 'intro',
                examples: ['debug-layer/performance-overlay', 'input/keyboard', 'input/gamepad', 'audio-basics/play-sound'],
            },
            {
                slug: 'deployment',
                level: 'intermediate',
                prerequisites: ['recipes/build-orb-dodge'],
            },
            {
                slug: 'v0-8-x-to-v0-9-0',
                level: 'intermediate',
            },
        ],
    },
];

const PARTS: ReadonlyArray<GuidePartMeta> = RAW_PARTS.map((rawPart, partIndex) => {
    const part = partIndex + 1;
    const partMeta: GuidePartMeta = {
        part,
        slug: rawPart.slug,
        title: rawPart.title,
        description: rawPart.description,
        chapters: rawPart.chapters.map((rawChapter, chapterIndex) => ({
            part,
            chapter: chapterIndex + 1,
            partSlug: rawPart.slug,
            partTitle: rawPart.title,
            slug: rawChapter.slug,
            path: `${rawPart.slug}/${rawChapter.slug}`,
            level: rawChapter.level,
            learningGoals: rawChapter.learningGoals ?? [],
            prerequisites: rawChapter.prerequisites ?? [],
            examples: rawChapter.examples ?? [],
            apiLinks: rawChapter.apiLinks ?? [],
        })),
    };
    return partMeta;
});

export const GUIDE_PARTS: ReadonlyArray<GuidePartMeta> = PARTS;

export const GUIDE_CHAPTERS: ReadonlyArray<GuideChapterMeta> = PARTS.flatMap(part => part.chapters);

export const GUIDE_CHAPTER_BY_PATH = new Map(GUIDE_CHAPTERS.map(chapter => [chapter.path, chapter]));

export const GUIDE_PART_BY_SLUG = new Map(GUIDE_PARTS.map(part => [part.slug, part]));

export interface LearningPathStep {
    /** Guide chapter path ("<partSlug>/<chapterSlug>"). */
    path: string;
    /** One concrete outcome for this step. */
    goal: string;
    /** Optional related playground example ("<category>/<slug>"). */
    example?: string;
}

/**
 * The recommended onboarding journey, shown on the guide landing page. Each step
 * links to a real chapter; the landing reconciliation test keeps every path and
 * example valid.
 */
export const GUIDE_LEARNING_PATH: ReadonlyArray<LearningPathStep> = [
    { path: 'getting-started/what-is-exojs', goal: 'See what ExoJS is and how its pieces fit together.' },
    { path: 'getting-started/setup', goal: 'Scaffold a typed project and run the dev server.' },
    { path: 'getting-started/project-structure', goal: 'Find your way around a create-exo-app project.', example: 'getting-started/hello-world' },
    { path: 'getting-started/your-first-scene', goal: 'Load a texture, draw a sprite, and animate it.', example: 'getting-started/hello-world' },
    { path: 'runtime/scenes-and-lifecycle', goal: 'Update state and render each frame.', example: 'getting-started/game-loop' },
    { path: 'input/keyboard-and-actions', goal: 'Move something in response to key presses.', example: 'input/keyboard' },
    { path: 'audio/audio-basics', goal: 'Play sound and music with reliable controls.', example: 'audio-basics/play-sound' },
    { path: 'recipes/build-orb-dodge', goal: 'Combine it all into a complete small game.', example: 'showcase/orb-dodge' },
    { path: 'shipping/deployment', goal: 'Build and host the finished project.' },
];

export interface GuideTopic {
    title: string;
    description: string;
    /** Guide chapter path the topic opens. */
    path: string;
}

/** Topic-based entry points on the guide landing page. */
export const GUIDE_TOPICS: ReadonlyArray<GuideTopic> = [
    { title: 'Build games', description: 'Scenes, input, collision, and a full game walkthrough.', path: 'recipes/build-orb-dodge' },
    { title: 'Create visuals', description: 'Graphics, sprites, text, filters, and particles.', path: 'rendering/graphics' },
    { title: 'Work with audio', description: 'Playback, spatial audio, effects, and beat detection.', path: 'audio/audio-basics' },
    { title: 'Load assets', description: 'Declare, load, and cache textures, audio, and data.', path: 'assets/loading-and-resources' },
    { title: 'Build UI', description: 'HUDs, dialog systems, pause menus, and typewriter text.', path: 'recipes/ui-patterns' },
    { title: 'Debug & optimize', description: 'Overlays, profiling, and render-pipeline inspection.', path: 'debugging/debugging-and-inspection' },
    { title: 'Ship your game', description: 'Build, troubleshoot, and deploy to production.', path: 'shipping/deployment' },
];

/** The core onboarding chapters that must carry full pedagogical metadata. */
export const CORE_ONBOARDING_PATHS: ReadonlyArray<string> = [
    'getting-started/what-is-exojs',
    'getting-started/setup',
    'getting-started/project-structure',
    'getting-started/your-first-scene',
    'runtime/scenes-and-lifecycle',
    'input/keyboard-and-actions',
    'audio/audio-basics',
    'recipes/build-orb-dodge',
];

/** Returns the chapters immediately before and after the given guide path. */
export function getAdjacentChapters(path: string): {
    previous: GuideChapterMeta | null;
    next: GuideChapterMeta | null;
} {
    const index = GUIDE_CHAPTERS.findIndex(chapter => chapter.path === path);
    if (index === -1) return { previous: null, next: null };
    return {
        previous: index > 0 ? GUIDE_CHAPTERS[index - 1] : null,
        next: index < GUIDE_CHAPTERS.length - 1 ? GUIDE_CHAPTERS[index + 1] : null,
    };
}

/** True when the value matches a known guide chapter path. */
export function isGuidePath(path: string): boolean {
    return GUIDE_CHAPTER_BY_PATH.has(path);
}
