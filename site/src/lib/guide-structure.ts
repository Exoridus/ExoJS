export interface GuideChapterMeta {
    part: number;
    chapter: number;
    partSlug: string;
    partTitle: string;
    partDescription: string;
    slug: string;
    title: string;
    description: string;
    path: string;
    examples: ReadonlyArray<string>;
}

export interface GuidePartMeta {
    part: number;
    slug: string;
    title: string;
    description: string;
    chapters: ReadonlyArray<GuideChapterMeta>;
}

const PARTS: ReadonlyArray<GuidePartMeta> = [
    {
        part: 1,
        slug: "introduction",
        title: "01 Introduction",
        description: "Start here to understand what ExoJS is and how to move through this guide.",
        chapters: [
            {
                part: 1,
                chapter: 1,
                partSlug: "introduction",
                partTitle: "01 Introduction",
                partDescription: "Start here to understand what ExoJS is and how to move through this guide.",
                slug: "what-is-exojs",
                title: "1.1 What is ExoJS?",
                description: "Understand where ExoJS fits and what kind of projects it is built for.",
                path: "introduction/what-is-exojs",
                examples: []
            },
            {
                part: 1,
                chapter: 2,
                partSlug: "introduction",
                partTitle: "01 Introduction",
                partDescription: "Start here to understand what ExoJS is and how to move through this guide.",
                slug: "setup",
                title: "1.2 Setup",
                description: "Install ExoJS, create an application, choose a canvas, and verify the runtime before writing scene code.",
                path: "introduction/setup",
                examples: []
            },
            {
                part: 1,
                chapter: 3,
                partSlug: "introduction",
                partTitle: "01 Introduction",
                partDescription: "Start here to understand what ExoJS is and how to move through this guide.",
                slug: "your-first-scene",
                title: "1.3 Your first scene",
                description: "Build a first scene and see the frame loop in action.",
                path: "introduction/your-first-scene",
                examples: [
                    "getting-started/hello-world"
                ]
            }
        ]
    },
    {
        part: 2,
        slug: "core-concepts",
        title: "02 Core Concepts",
        description: "These chapters explain the runtime model that most ExoJS projects rely on.",
        chapters: [
            {
                part: 2,
                chapter: 1,
                partSlug: "core-concepts",
                partTitle: "02 Core Concepts",
                partDescription: "These chapters explain the runtime model that most ExoJS projects rely on.",
                slug: "application",
                title: "2.1 Application",
                description: "How the application owns canvas lifecycle, sizing, and startup.",
                path: "core-concepts/application",
                examples: [
                    "getting-started/hello-world",
                    "getting-started/resize-and-dpr"
                ]
            },
            {
                part: 2,
                chapter: 2,
                partSlug: "core-concepts",
                partTitle: "02 Core Concepts",
                partDescription: "These chapters explain the runtime model that most ExoJS projects rely on.",
                slug: "scenes",
                title: "2.2 Scenes",
                description: "How scenes split responsibilities and keep projects composable.",
                path: "core-concepts/scenes",
                examples: [
                    "application-scenes/multiple-scenes"
                ]
            },
            {
                part: 2,
                chapter: 3,
                partSlug: "core-concepts",
                partTitle: "02 Core Concepts",
                partDescription: "These chapters explain the runtime model that most ExoJS projects rely on.",
                slug: "scene-lifecycle",
                title: "2.3 Scene lifecycle",
                description: "How load, init, update, and draw work together as one repeatable loop.",
                path: "core-concepts/scene-lifecycle",
                examples: [
                    "application-scenes/scene-lifecycle",
                    "application-scenes/pause-and-resume",
                    "getting-started/game-loop"
                ]
            },
            {
                part: 2,
                chapter: 4,
                partSlug: "core-concepts",
                partTitle: "02 Core Concepts",
                partDescription: "These chapters explain the runtime model that most ExoJS projects rely on.",
                slug: "scene-graph",
                title: "2.4 Scene graph",
                description: "How transforms, hierarchy, masks, and draw order shape what you see.",
                path: "core-concepts/scene-graph",
                examples: [
                    "scene-graph/containers",
                    "scene-graph/nested-transforms",
                    "scene-graph/local-vs-global-transform",
                    "scene-graph/pivot-and-anchor",
                    "scene-graph/z-ordering",
                    "scene-graph/masks"
                ]
            },
            {
                part: 2,
                chapter: 5,
                partSlug: "core-concepts",
                partTitle: "02 Core Concepts",
                partDescription: "These chapters explain the runtime model that most ExoJS projects rely on.",
                slug: "coordinates-and-views",
                title: "2.5 Coordinates and views",
                description: "How world space, screen space, and camera views map onto each other.",
                path: "core-concepts/coordinates-and-views",
                examples: [
                    "application-scenes/camera-and-view",
                    "application-scenes/multi-view-split-screen",
                    "application-scenes/picture-in-picture",
                    "application-scenes/world-vs-screen-coords"
                ]
            },
            {
                part: 2,
                chapter: 6,
                partSlug: "core-concepts",
                partTitle: "02 Core Concepts",
                partDescription: "These chapters explain the runtime model that most ExoJS projects rely on.",
                slug: "loading-and-resources",
                title: "2.6 Loading and resources",
                description: "How to load resources predictably and keep asset access consistent.",
                path: "core-concepts/loading-and-resources",
                examples: [
                    "sprites-textures/texture-loader"
                ]
            }
        ]
    },
    {
        part: 3,
        slug: "drawing",
        title: "03 Drawing",
        description: "Use ExoJS drawing primitives, sprites, text, and animation to build a scene.",
        chapters: [
            {
                part: 3,
                chapter: 1,
                partSlug: "drawing",
                partTitle: "03 Drawing",
                partDescription: "Use ExoJS drawing primitives, sprites, text, and animation to build a scene.",
                slug: "graphics",
                title: "3.1 Graphics",
                description: "Draw procedural shapes and mesh-based geometry.",
                path: "drawing/graphics",
                examples: [
                    "geometry-graphics/graphics-primitives",
                    "geometry-graphics/infinite-grid",
                    "geometry-graphics/mesh-triangle",
                    "geometry-graphics/mesh-textured-quad",
                    "geometry-graphics/mesh-deformed-grid"
                ]
            },
            {
                part: 3,
                chapter: 2,
                partSlug: "drawing",
                partTitle: "03 Drawing",
                partDescription: "Use ExoJS drawing primitives, sprites, text, and animation to build a scene.",
                slug: "sprites",
                title: "3.2 Sprites",
                description: "Render image-based content from textures, sheets, SVG, and video.",
                path: "drawing/sprites",
                examples: [
                    "sprites-textures/sprite-basics",
                    "sprites-textures/blendmodes",
                    "sprites-textures/spritesheet-frames",
                    "sprites-textures/svg-drawable",
                    "sprites-textures/video-drawable"
                ]
            },
            {
                part: 3,
                chapter: 3,
                partSlug: "drawing",
                partTitle: "03 Drawing",
                partDescription: "Use ExoJS drawing primitives, sprites, text, and animation to build a scene.",
                slug: "text",
                title: "3.3 Text",
                description: "Control layout, styling, and visual effects for runtime text.",
                path: "drawing/text",
                examples: [
                    "text-fonts/basic-text",
                    "text-fonts/multiline-and-wrap",
                    "text-fonts/stroke-and-shadow",
                    "text-fonts/web-fonts",
                    "text-fonts/text-glitch"
                ]
            },
            {
                part: 3,
                chapter: 4,
                partSlug: "drawing",
                partTitle: "03 Drawing",
                partDescription: "Use ExoJS drawing primitives, sprites, text, and animation to build a scene.",
                slug: "animation",
                title: "3.4 Animation",
                description: "Animate transforms and values with tweens and frame updates.",
                path: "drawing/animation",
                examples: [
                    "tweens-animation/easing-curves",
                    "tweens-animation/frame-animation",
                    "tweens-animation/interrupt-and-replace",
                    "tweens-animation/tween-basics",
                    "tweens-animation/tween-chains",
                    "tweens-animation/tween-from-array",
                    "tweens-animation/tween-with-yoyo"
                ]
            },
            {
                part: 3,
                chapter: 5,
                partSlug: "drawing",
                partTitle: "03 Drawing",
                partDescription: "Use ExoJS drawing primitives, sprites, text, and animation to build a scene.",
                slug: "render-targets",
                title: "3.5 Render targets",
                description: "Render into intermediate textures and reuse those outputs in scene composition.",
                path: "drawing/render-targets",
                examples: [
                    "render-targets/render-to-texture",
                    "render-targets/mini-map"
                ]
            }
        ]
    },
    {
        part: 4,
        slug: "input",
        title: "04 Input",
        description: "Handle keyboard, pointer, touch, and gamepad with predictable input flow.",
        chapters: [
            {
                part: 4,
                chapter: 1,
                partSlug: "input",
                partTitle: "04 Input",
                partDescription: "Handle keyboard, pointer, touch, and gamepad with predictable input flow.",
                slug: "keyboard",
                title: "4.1 Keyboard",
                description: "Capture keys and support configurable bindings.",
                path: "input/keyboard",
                examples: [
                    "input/keyboard",
                    "input/key-rebinding"
                ]
            },
            {
                part: 4,
                chapter: 2,
                partSlug: "input",
                partTitle: "04 Input",
                partDescription: "Handle keyboard, pointer, touch, and gamepad with predictable input flow.",
                slug: "mouse-and-pointer",
                title: "4.2 Mouse and pointer",
                description: "Work with pointer events across mouse and touch-compatible devices.",
                path: "input/mouse-and-pointer",
                examples: [
                    "input/mouse-and-pointer",
                    "input/multitouch",
                    "input/pointer-to-world"
                ]
            },
            {
                part: 4,
                chapter: 3,
                partSlug: "input",
                partTitle: "04 Input",
                partDescription: "Handle keyboard, pointer, touch, and gamepad with predictable input flow.",
                slug: "gamepad",
                title: "4.3 Gamepad",
                description: "Read controller input and support multiple connected gamepads.",
                path: "input/gamepad",
                examples: [
                    "input/gamepad",
                    "input/multi-gamepad"
                ]
            },
            {
                part: 4,
                chapter: 4,
                partSlug: "input",
                partTitle: "04 Input",
                partDescription: "Handle keyboard, pointer, touch, and gamepad with predictable input flow.",
                slug: "action-mapping",
                title: "4.4 Action mapping",
                description: "Map multiple devices to the same intent-driven input actions.",
                path: "input/action-mapping",
                examples: [
                    "input/action-mapping"
                ]
            }
        ]
    },
    {
        part: 5,
        slug: "audio",
        title: "05 Audio",
        description: "Build complete audio behavior from playback to effects and analysis.",
        chapters: [
            {
                part: 5,
                chapter: 1,
                partSlug: "audio",
                partTitle: "05 Audio",
                partDescription: "Build complete audio behavior from playback to effects and analysis.",
                slug: "audio-basics",
                title: "5.1 Audio basics",
                description: "Play sounds and music with reliable runtime controls.",
                path: "audio/audio-basics",
                examples: [
                    "audio-basics/audio-buses",
                    "audio-basics/crossfade-tracks",
                    "audio-basics/music-loop",
                    "audio-basics/play-sound",
                    "audio-basics/random-pitch-pool",
                    "audio-basics/sound-pool"
                ]
            },
            {
                part: 5,
                chapter: 2,
                partSlug: "audio",
                partTitle: "05 Audio",
                partDescription: "Build complete audio behavior from playback to effects and analysis.",
                slug: "spatial-audio",
                title: "5.2 Spatial audio",
                description: "Place listener and sources in space for directional sound behavior.",
                path: "audio/spatial-audio",
                examples: [
                    "spatial-audio/listener-and-source",
                    "spatial-audio/moving-source",
                    "spatial-audio/falloff-curves"
                ]
            },
            {
                part: 5,
                chapter: 3,
                partSlug: "audio",
                partTitle: "05 Audio",
                partDescription: "Build complete audio behavior from playback to effects and analysis.",
                slug: "audio-effects",
                title: "5.3 Audio effects",
                description: "Shape sound with filters and bus-level processing.",
                path: "audio/audio-effects",
                examples: [
                    "audio-fx/compressor",
                    "audio-fx/ducking",
                    "audio-fx/reverb-and-delay",
                    "audio-fx/vocoder"
                ]
            },
            {
                part: 5,
                chapter: 4,
                partSlug: "audio",
                partTitle: "05 Audio",
                partDescription: "Build complete audio behavior from playback to effects and analysis.",
                slug: "beat-detection",
                title: "5.4 Beat detection",
                description: "Drive visuals from beat and frequency information.",
                path: "audio/beat-detection",
                examples: [
                    "beat-detection/beat-sync-pulse",
                    "beat-detection/frequency-bands",
                    "beat-detection/tempo-tracking"
                ]
            }
        ]
    },
    {
        part: 6,
        slug: "effects",
        title: "06 Effects",
        description: "Layer visual effects to build mood, motion, and feedback.",
        chapters: [
            {
                part: 6,
                chapter: 1,
                partSlug: "effects",
                partTitle: "06 Effects",
                partDescription: "Layer visual effects to build mood, motion, and feedback.",
                slug: "filters",
                title: "6.1 Filters",
                description: "Stack shader and color effects to control final image style.",
                path: "effects/filters",
                examples: [
                    "filters/blur-filter",
                    "filters/chromatic-aberration",
                    "filters/color-filter",
                    "filters/crt-scanlines",
                    "filters/custom-fragment-shader",
                    "filters/filter-stack",
                    "filters/metaballs",
                    "filters/noise-vignette",
                    "filters/palette-cycling",
                    "showcase/color-grading"
                ]
            },
            {
                part: 6,
                chapter: 2,
                partSlug: "effects",
                partTitle: "06 Effects",
                partDescription: "Layer visual effects to build mood, motion, and feedback.",
                slug: "particles",
                title: "6.2 Particles",
                description: "Spawn and tune particle systems for environmental and reactive effects.",
                path: "effects/particles",
                examples: [
                    "particles/bonfire",
                    "particles/cursor-attractor-particles",
                    "particles/custom-wgsl-module",
                    "particles/emitter-basics",
                    "particles/fireworks",
                    "particles/gpu-particles"
                ]
            },
            {
                part: 6,
                chapter: 3,
                partSlug: "effects",
                partTitle: "06 Effects",
                partDescription: "Layer visual effects to build mood, motion, and feedback.",
                slug: "post-processing",
                title: "6.3 Post-processing",
                description: "Build multi-pass render flows for bloom, trails, and mirror effects.",
                path: "effects/post-processing",
                examples: [
                    "render-targets/bloom-lite",
                    "render-targets/post-processing-chain",
                    "render-targets/trail-feedback",
                    "render-targets/water-mirror"
                ]
            }
        ]
    },
    {
        part: 7,
        slug: "advanced",
        title: "07 Advanced",
        description: "Go deeper when you need custom pipelines, tooling, and profiling data.",
        chapters: [
            {
                part: 7,
                chapter: 1,
                partSlug: "advanced",
                partTitle: "07 Advanced",
                partDescription: "Go deeper when you need custom pipelines, tooling, and profiling data.",
                slug: "custom-renderers",
                title: "7.1 Custom renderers",
                description: "Extend rendering with custom passes and backend-specific logic.",
                path: "advanced/custom-renderers",
                examples: [
                    "custom-renderers/custom-render-pass",
                    "custom-renderers/custom-triangle-renderer"
                ]
            },
            {
                part: 7,
                chapter: 2,
                partSlug: "advanced",
                partTitle: "07 Advanced",
                partDescription: "Go deeper when you need custom pipelines, tooling, and profiling data.",
                slug: "debug-layer",
                title: "7.2 Debug layer",
                description: "Inspect scene state and runtime behavior while a scene is running.",
                path: "advanced/debug-layer",
                examples: [
                    "debug-layer/bounding-boxes",
                    "debug-layer/performance-overlay",
                    "debug-layer/pointer-and-hittest",
                    "debug-layer/signal-bus-inspector"
                ]
            },
            {
                part: 7,
                chapter: 3,
                partSlug: "advanced",
                partTitle: "07 Advanced",
                partDescription: "Go deeper when you need custom pipelines, tooling, and profiling data.",
                slug: "performance",
                title: "7.3 Performance",
                description: "Measure scene limits with focused stress examples.",
                path: "advanced/performance",
                examples: [
                    "performance/sprite-stress",
                    "performance/multi-texture-stress",
                    "performance/particle-stress"
                ]
            },
            {
                part: 7,
                chapter: 4,
                partSlug: "advanced",
                partTitle: "07 Advanced",
                partDescription: "Go deeper when you need custom pipelines, tooling, and profiling data.",
                slug: "backend-comparison",
                title: "7.4 Backend comparison",
                description: "Compare backend behavior and decide what to ship.",
                path: "advanced/backend-comparison",
                examples: [
                    "performance/backend-comparison"
                ]
            },
            {
                part: 7,
                chapter: 5,
                partSlug: "advanced",
                partTitle: "07 Advanced",
                partDescription: "Go deeper when you need custom pipelines, tooling, and profiling data.",
                slug: "collision-detection",
                title: "7.5 Collision detection",
                description: "Validate collision flow and response with interactive shapes.",
                path: "advanced/collision-detection",
                examples: [
                    "showcase/rectangles-collision"
                ]
            }
        ]
    },
    {
        part: 8,
        slug: "recipes",
        title: "08 Recipes",
        description: "Use practical scene patterns you can adapt directly in production.",
        chapters: [
            {
                part: 8,
                chapter: 1,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "hud-overlay",
                title: "8.1 HUD overlay",
                description: "Compose gameplay and UI layers without coupling scene logic.",
                path: "recipes/hud-overlay",
                examples: [
                    "application-scenes/hud-overlay-scene",
                    "showcase/minimap-with-mask"
                ]
            },
            {
                part: 8,
                chapter: 2,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "camera-follow-and-parallax",
                title: "8.2 Camera follow & parallax",
                description: "Create depth and motion parallax from camera and pointer movement.",
                path: "recipes/camera-follow-and-parallax",
                examples: [
                    "showcase/mouse-parallax",
                    "scene-graph/parallax-starfield"
                ]
            },
            {
                part: 8,
                chapter: 3,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "pause-menu",
                title: "8.3 Pause menu",
                description: "Pause scene updates while keeping clear visual context for players.",
                path: "recipes/pause-menu",
                examples: [
                    "showcase/pause-blur"
                ]
            },
            {
                part: 8,
                chapter: 4,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "split-screen",
                title: "8.4 Split screen",
                description: "Render multiple viewpoints in a shared scene timeline.",
                path: "recipes/split-screen",
                examples: [
                    "application-scenes/multi-view-split-screen"
                ]
            },
            {
                part: 8,
                chapter: 5,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "audio-reactive-scene",
                title: "8.5 Audio reactive scene",
                description: "Map audio analysis to movement, particles, and camera response.",
                path: "recipes/audio-reactive-scene",
                examples: [
                    "showcase/audio-reactive-particles",
                    "showcase/audio-visualisation",
                    "showcase/low-band-camera-shake",
                    "showcase/vinyl-record"
                ]
            },
            {
                part: 8,
                chapter: 6,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "game-feel",
                title: "8.6 Game feel",
                description: "Add feedback cues that make interaction feel responsive.",
                path: "recipes/game-feel",
                examples: [
                    "showcase/damage-flash",
                    "showcase/screen-shake-on-explosion",
                    "showcase/gamepad-spaceship"
                ]
            },
            {
                part: 8,
                chapter: 7,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "ui-patterns",
                title: "8.7 UI patterns",
                description: "Build reusable dialog and text-flow UI behavior in-scene.",
                path: "recipes/ui-patterns",
                examples: [
                    "showcase/dialog-system",
                    "showcase/typewriter-text"
                ]
            },
            {
                part: 8,
                chapter: 8,
                partSlug: "recipes",
                partTitle: "08 Recipes",
                partDescription: "Use practical scene patterns you can adapt directly in production.",
                slug: "cinematics",
                title: "8.8 Cinematics",
                description: "Coordinate timing, camera, and audio for scripted scene beats.",
                path: "recipes/cinematics",
                examples: [
                    "showcase/boss-intro-cinematic"
                ]
            }
        ]
    }
];

export const GUIDE_PARTS: ReadonlyArray<GuidePartMeta> = PARTS;

export const GUIDE_CHAPTERS: ReadonlyArray<GuideChapterMeta> = PARTS.flatMap(part => part.chapters);

export const GUIDE_CHAPTER_BY_PATH = new Map(GUIDE_CHAPTERS.map(chapter => [chapter.path, chapter]));
