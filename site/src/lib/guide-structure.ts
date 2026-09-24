/** Learning-oriented Guide navigation. URLs remain independent of the topic grouping. */
export type GuideLevel = 'intro' | 'intermediate' | 'advanced';
export const GUIDE_LEVELS: ReadonlyArray<GuideLevel> = ['intro', 'intermediate', 'advanced'];
export const GUIDE_LEVEL_LABEL: Record<GuideLevel, string> = { intro: 'Intro', intermediate: 'Intermediate', advanced: 'Advanced' };
interface RawChapter {
  path: string;
  level: GuideLevel;
  learningGoals: ReadonlyArray<string>;
  prerequisites: ReadonlyArray<string>;
  examples: ReadonlyArray<string>;
  apiLinks: ReadonlyArray<string>;
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
    title: 'Start here',
    description: 'Create a working scene and understand the canvas you are building on.',
    chapters: [
      {
        path: 'getting-started/what-is-exojs',
        level: 'intro',
        learningGoals: ['Decide whether a code-first canvas runtime fits the project', 'Distinguish the Guide, Playground, package README, and API reference'],
        prerequisites: [],
        examples: [],
        apiLinks: ['application', 'scene'],
      },
      {
        path: 'getting-started/setup',
        level: 'intro',
        learningGoals: ['Run a starter and choose among the current templates', 'Locate startup, scene code, public assets, and production output'],
        prerequisites: ['getting-started/what-is-exojs'],
        examples: [],
        apiLinks: ['application'],
      },
      {
        path: 'getting-started/your-first-scene',
        level: 'intro',
        learningGoals: ['Draw a visible object without external assets', 'Separate scene setup, time-based updates, and explicit world rendering'],
        prerequisites: ['getting-started/setup'],
        examples: ['getting-started/hello-world'],
        apiLinks: ['application', 'scene', 'sprite', 'texture', 'loader'],
      },
      {
        path: 'getting-started/resize-dpr-and-canvas',
        level: 'intro',
        learningGoals: [
          'Distinguish logical canvas size from CSS and backing pixels',
          'Choose a sizing policy and handle resize without moving every object manually',
        ],
        prerequisites: ['getting-started/your-first-scene'],
        examples: ['getting-started/resize-and-dpr'],
        apiLinks: ['application'],
      },
    ],
  },
  {
    slug: 'runtime',
    title: 'Runtime and interaction',
    description: 'Own scene lifetimes, compose objects, and route input into a usable interface.',
    chapters: [
      {
        path: 'runtime/application',
        level: 'intro',
        learningGoals: ['Give the canvas and application services a clear host lifetime', 'Await startup and distinguish stop from permanent teardown'],
        prerequisites: ['getting-started/your-first-scene'],
        examples: ['getting-started/hello-world', 'getting-started/resize-and-dpr'],
        apiLinks: ['application'],
      },
      {
        path: 'runtime/scenes-and-lifecycle',
        level: 'intro',
        learningGoals: [
          'Place asynchronous loading and synchronous updates in the correct hooks',
          'Distinguish ownership, ordinary pause, retention, and final teardown',
        ],
        prerequisites: ['getting-started/your-first-scene'],
        examples: ['application-scenes/multiple-scenes', 'showcase/pause-blur', 'getting-started/hello-world'],
        apiLinks: ['scene', 'loader', 'time'],
      },
      {
        path: 'runtime/scene-graph',
        level: 'intermediate',
        learningGoals: ['Compose local transforms through a parent hierarchy', 'Separate hierarchy, rendering order, and resource ownership'],
        prerequisites: ['runtime/scenes-and-lifecycle'],
        examples: ['scene-graph/nested-transforms', 'scene-graph/pivot-and-anchor', 'debug-layer/pointer-and-hittest', 'scene-graph/masks'],
        apiLinks: ['container', 'drawable'],
      },
      {
        path: 'runtime/coordinates-and-views',
        level: 'intermediate',
        learningGoals: [
          'Convert between local, world, and logical canvas coordinates',
          'Render one world through independent views without duplicating simulation',
        ],
        prerequisites: ['runtime/scene-graph'],
        examples: ['application-scenes/world-vs-screen-coords', 'application-scenes/multi-view-split-screen', 'application-scenes/picture-in-picture'],
        apiLinks: ['view', 'pass-context'],
      },
      {
        path: 'input/keyboard-and-actions',
        level: 'intro',
        learningGoals: ['Bind physical controls to named gameplay actions', 'Use held values and transition signals with scene availability'],
        prerequisites: ['runtime/scenes-and-lifecycle'],
        examples: ['input/keyboard', 'input/key-rebinding', 'input/action-mapping'],
        apiLinks: ['keyboard', 'input-system'],
      },
      {
        path: 'input/mouse-and-pointer',
        level: 'intro',
        learningGoals: ['Convert pointer coordinates through the intended view', 'Handle capture, gestures, cancellation, and pointer lifetime'],
        prerequisites: ['runtime/coordinates-and-views', 'input/keyboard-and-actions'],
        examples: ['input/mouse-and-pointer', 'input/multitouch', 'application-scenes/world-vs-screen-coords'],
        apiLinks: ['pointer', 'input-system'],
      },
      {
        path: 'input/gamepad',
        level: 'intermediate',
        learningGoals: ['Assign a connected controller and bind its controls', 'Handle disconnection, analog values, and optional haptics'],
        prerequisites: ['input/keyboard-and-actions'],
        examples: ['input/gamepad', 'application-scenes/multi-view-split-screen'],
        apiLinks: ['gamepad', 'input-system'],
      },
      {
        path: 'input/chords-and-sequences',
        level: 'intermediate',
        learningGoals: ['Choose simultaneous chords or ordered input sequences', 'Handle sequence timing, cancellation, and progress correctly'],
        prerequisites: ['input/keyboard-and-actions'],
        examples: ['input/action-mapping', 'input/key-rebinding'],
        apiLinks: ['chord-action', 'sequence-action', 'action-map'],
      },
      {
        path: 'runtime/ui-and-widgets',
        level: 'intermediate',
        learningGoals: ['Build a screen-fixed HUD using owned widgets', 'Coordinate layout, focus, modal interaction, and DOM accessibility'],
        prerequisites: ['runtime/scenes-and-lifecycle', 'input/keyboard-and-actions'],
        examples: ['ui/hud-and-widgets', 'ui/settings-menu', 'ui/text-entry-and-scrolling'],
        apiLinks: ['uiroot', 'widget', 'button', 'panel', 'label', 'progress-bar', 'interaction-system'],
      },
    ],
  },
  {
    slug: 'assets',
    title: 'Assets and worlds',
    description: 'Acquire resources through an owner and turn authored data into streamable content.',
    chapters: [
      {
        path: 'assets/loading-and-resources',
        level: 'intermediate',
        learningGoals: ['Choose awaited loading or a deliberate placeholder', 'Release independent resource claims through their owning scope'],
        prerequisites: ['runtime/scenes-and-lifecycle'],
        examples: ['application-scenes/loading-screen'],
        apiLinks: ['loader', 'texture'],
      },
      {
        path: 'assets/asset-catalogs',
        level: 'intermediate',
        learningGoals: [
          'Compose named asset definitions without eagerly fetching them',
          'Distinguish deferred catalog leaves from resolved values and validated data',
        ],
        prerequisites: ['assets/loading-and-resources'],
        examples: ['sprites-textures/asset-catalogs'],
        apiLinks: ['assets', 'asset', 'loader-scope', 'asset-ref'],
      },
      {
        path: 'assets/device-variants',
        level: 'advanced',
        learningGoals: ['Select an asset source using actual capabilities', 'Keep a usable fallback and distinguish compression format from container'],
        prerequisites: ['assets/loading-and-resources'],
        examples: [],
        apiLinks: ['loader', 'texture', 'compressed-texture', 'compressed-texture-format', 'asset-variant-set'],
      },
      {
        path: 'assets/offline',
        level: 'advanced',
        learningGoals: [
          'Separate resident resources from persistent source caching',
          'Handle connectivity without assuming the entire application is offline-ready',
        ],
        prerequisites: ['assets/loading-and-resources'],
        examples: [],
        apiLinks: ['loader', 'connectivity', 'asset-cache', 'connectivity-policy-resolver'],
      },
      {
        path: 'assets/aseprite',
        level: 'intermediate',
        learningGoals: ['Load an Aseprite export and choose an authored animation tag', 'Handle frame timing, atlas layout, and resource lifetime'],
        prerequisites: ['assets/loading-and-resources', 'rendering/sprites'],
        examples: [],
        apiLinks: ['aseprite-sheet', 'animated-sprite', 'loader'],
      },
      {
        path: 'assets/tiled-maps',
        level: 'intermediate',
        learningGoals: [
          'Load and render a Tiled JSON map through the generic tilemap runtime',
          'Distinguish visible tiles, authored objects, collision, and streaming',
        ],
        prerequisites: ['assets/loading-and-resources'],
        examples: [],
        apiLinks: ['loader'],
      },
      {
        path: 'assets/ldtk',
        level: 'intermediate',
        learningGoals: ['Choose eager map loading or project-driven level loading', 'Resolve external levels and keep level resources independently owned'],
        prerequisites: ['assets/loading-and-resources'],
        examples: [],
        apiLinks: ['ldtk-map', 'tile-map', 'tile-map-node', 'loader'],
      },
      {
        path: 'assets/worlds-and-spawning',
        level: 'advanced',
        learningGoals: ['Spawn owned game objects from authored level data', 'Unload a level and handle failed or cancelled acquisition safely'],
        prerequisites: ['assets/tiled-maps', 'assets/loading-and-resources'],
        examples: ['tilemap/editor-objects-gameplay', 'tilemap/level-loading-and-ownership'],
        apiLinks: ['map-world', 'map-world-runtime', 'map-level-runtime', 'map-object-spawner', 'map-spawn-session', 'ldtk-project', 'loader-scope'],
      },
      {
        path: 'rendering/infinite-maps',
        level: 'advanced',
        learningGoals: ['Separate a map source from resident rendered chunks', 'Budget streaming work and clean up a chunk source at the owner boundary'],
        prerequisites: ['assets/tiled-maps'],
        examples: ['tilemap/worker-streamed-terrain', 'tilemap/tiled-infinite-map'],
        apiLinks: ['tile-map', 'tile-layer', 'chunk-streamer', 'chunk-source', 'tilemap-functions', 'tiled-map'],
      },
    ],
  },
  {
    slug: 'rendering',
    title: 'Drawing and composition',
    description: 'Choose a drawable, understand its coordinate space, and compose targets without losing ownership.',
    chapters: [
      {
        path: 'rendering/graphics',
        level: 'intro',
        learningGoals: ['Create reusable geometry in local coordinates', 'Change geometry deliberately instead of rebuilding unchanged shapes every frame'],
        prerequisites: ['getting-started/your-first-scene'],
        examples: ['geometry-graphics/graphics-gradient', 'geometry-graphics/mesh-textured-quad', 'geometry-graphics/mesh-deformed-grid'],
        apiLinks: ['graphics', 'color'],
      },
      {
        path: 'rendering/sprites',
        level: 'intro',
        learningGoals: [
          'Place a texture-backed drawable with intentional anchor and sampling',
          'Distinguish image data, atlas frames, and shared texture lifetime',
        ],
        prerequisites: ['assets/loading-and-resources'],
        examples: [
          'sprites-textures/sprite-basics',
          'sprites-textures/texture-sampling',
          'sprites-textures/blendmodes',
          'tweens-animation/frame-animation',
          'sprites-textures/video-drawable',
        ],
        apiLinks: ['sprite', 'spritesheet', 'texture'],
      },
      {
        path: 'rendering/text',
        level: 'intro',
        learningGoals: ['Choose text rendering and load the required font', 'Distinguish layout, ink bounds, wrapping, and shaping constraints'],
        prerequisites: ['assets/loading-and-resources', 'runtime/scene-graph'],
        examples: ['text-fonts/typographic-styling', 'text-fonts/multiline-and-wrap'],
        apiLinks: ['text', 'bitmap-text', 'text-style'],
      },
      {
        path: 'rendering/pixel-snapping',
        level: 'intermediate',
        learningGoals: ['Choose position or geometry snapping for the intended image', 'Keep rendering alignment separate from simulation coordinates'],
        prerequisites: ['rendering/sprites', 'getting-started/resize-dpr-and-canvas'],
        examples: ['sprites-textures/texture-sampling'],
        apiLinks: ['drawable', 'sprite', 'view'],
      },
      {
        path: 'rendering/render-targets',
        level: 'advanced',
        learningGoals: ['Render into an owned texture with scoped target state', 'Handle resizing, feedback, and borrowed output textures safely'],
        prerequisites: ['runtime/coordinates-and-views', 'rendering/sprites'],
        examples: ['render-targets/render-to-texture', 'render-targets/mini-map'],
        apiLinks: ['render-target', 'render-texture', 'multi-render-target', 'mesh-material'],
      },
      {
        path: 'rendering/retained-containers',
        level: 'advanced',
        learningGoals: [
          'Choose retained recording instead of texture caching for the right workload',
          'Understand structural invalidation, row updates, and reuse limits',
        ],
        prerequisites: ['runtime/scene-graph', 'debugging/performance'],
        examples: ['scene-graph/retained-container'],
        apiLinks: ['retained-container', 'container', 'scene-node', 'view'],
      },
      {
        path: 'rendering/immediate-mode',
        level: 'advanced',
        learningGoals: ['Submit procedural drawing through a reusable immediate-mode path', 'Keep packed buffers, transforms, and their lifetimes explicit'],
        prerequisites: ['rendering/graphics'],
        examples: ['geometry-graphics/immediate-mode-rendering'],
        apiLinks: ['rendering-context', 'render-batch', 'geometry', 'mesh', 'mesh-material', 'shader', 'matrix', 'color'],
      },
    ],
  },
  {
    slug: 'effects',
    title: 'Animation and visual effects',
    description: 'Animate existing state and choose effects with explicit capability and cost boundaries.',
    chapters: [
      {
        path: 'rendering/animation',
        level: 'intermediate',
        learningGoals: ['Choose frame animation or property interpolation', 'Handle repeat semantics, pause policy, and competing animations'],
        prerequisites: ['runtime/scenes-and-lifecycle', 'rendering/sprites'],
        examples: ['tweens-animation/easing-curves', 'tweens-animation/frame-animation', 'tweens-animation/tween-basics', 'tweens-animation/tween-chains'],
        apiLinks: ['tween', 'tween-system', 'animated-sprite'],
      },
      {
        path: 'effects/filters',
        level: 'intermediate',
        learningGoals: ['Choose a node, group, or frame effect boundary', 'Own filter resources and distinguish logical effects from hardware passes'],
        prerequisites: ['rendering/sprites'],
        examples: ['filters/blur-filter', 'filters/color-matrix-filter', 'filters/crt-scanlines', 'filters/custom-fragment-shader', 'filters/metaballs'],
        apiLinks: ['filter', 'color-matrix-filter', 'blur-filter'],
      },
      {
        path: 'effects/post-processing',
        level: 'advanced',
        learningGoals: ['Compose frame passes and filters in an explicit order', 'Avoid read-write feedback and restore scoped rendering state'],
        prerequisites: ['effects/filters', 'rendering/render-targets'],
        examples: ['filters/bloom-filter', 'render-targets/render-pipeline', 'render-targets/trail-feedback', 'render-targets/water-mirror'],
        apiLinks: ['render-target', 'filter'],
      },
      {
        path: 'effects/particles',
        level: 'intermediate',
        learningGoals: ['Build a bounded scene-owned emitter in local space', 'Inspect CPU/GPU routing and handle changes that restart live particles'],
        prerequisites: ['runtime/scenes-and-lifecycle'],
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
        path: 'effects/lighting',
        level: 'intermediate',
        learningGoals: ['Choose a lighting model rather than an assumed quality tier', 'Register lights, shadows, and normal sources with correct ownership'],
        prerequisites: ['runtime/scenes-and-lifecycle', 'rendering/sprites'],
        examples: ['lighting/shadow-casters', 'lighting/lightmap-normals', 'lighting/radiance-rooms'],
        apiLinks: ['lighting', 'point-light', 'spot-light', 'line-light', 'sun-light', 'lit-material'],
      },
      {
        path: 'effects/custom-mesh-shaders',
        level: 'advanced',
        learningGoals: ['Use material schemas and backend shader counterparts', 'Separate host-side types from shader compilation and visual validation'],
        prerequisites: ['rendering/graphics', 'rendering/sprites'],
        examples: ['geometry-graphics/mesh-textured-quad', 'geometry-graphics/mesh-deformed-grid'],
        apiLinks: ['mesh'],
      },
    ],
  },
  {
    slug: 'audio',
    title: 'Audio and timing',
    description: 'Play owned voices, route effects, and connect audio analysis to presentation.',
    chapters: [
      {
        path: 'audio/audio-basics',
        level: 'intro',
        learningGoals: ['Distinguish a loaded audio asset from a playing voice', 'Unlock playback and choose the voice and bus lifetime'],
        prerequisites: ['assets/loading-and-resources'],
        examples: [
          'audio-basics/play-sound',
          'audio-basics/music-loop',
          'audio-basics/crossfade-tracks',
          'audio-basics/sound-pool',
          'audio-basics/audio-buses',
        ],
        apiLinks: ['sound', 'audio-stream', 'audio-system'],
      },
      {
        path: 'audio/spatial-audio',
        level: 'intermediate',
        learningGoals: ['Map world positions into a consistent audio space', 'Own listener and source updates without conflating pan with volume'],
        prerequisites: ['audio/audio-basics', 'runtime/coordinates-and-views'],
        examples: ['spatial-audio/listener-and-source'],
        apiLinks: ['audio-listener', 'audio-system', 'audio-send', 'audio-zone', 'spatial-zones'],
      },
      {
        path: 'audio/audio-effects',
        level: 'intermediate',
        learningGoals: [
          'Route an effect chain without duplicating the dry signal accidentally',
          'Own effect nodes and handle asynchronous worklet or impulse loading',
        ],
        prerequisites: ['audio/audio-basics'],
        examples: ['audio-fx/compressor', 'audio-fx/ducking', 'audio-fx/reverb-and-delay', 'audio-fx/vocoder'],
        apiLinks: ['audio-bus', 'audio-effect'],
      },
      {
        path: 'audio/beat-detection',
        level: 'intermediate',
        learningGoals: [
          'Tap live audio and distinguish acquisition from a locked estimate',
          'Use timing and confidence without treating detection as an authoritative beatmap',
        ],
        prerequisites: ['audio/audio-basics'],
        examples: ['beat-detection/beat-sync-pulse', 'showcase/audio-visualisation'],
        apiLinks: ['beat-detector', 'audio-analyser'],
      },
      {
        path: 'audio/audio-reactive-visualization',
        level: 'intermediate',
        learningGoals: ['Map one live analysis stream into bounded visual changes', 'Correlate audio time with presentation and own spectrum-history textures'],
        prerequisites: ['audio/audio-basics', 'audio/beat-detection'],
        examples: ['showcase/audio-visualisation', 'beat-detection/beat-sync-pulse', 'showcase/audio-reactive-particles'],
        apiLinks: ['audio-analyser', 'beat-detector'],
      },
    ],
  },
  {
    slug: 'gameplay',
    title: 'Gameplay systems',
    description: 'Choose geometry queries, simulation, navigation, or serialization for the task at hand.',
    chapters: [
      {
        path: 'recipes/gameplay-collision',
        level: 'advanced',
        learningGoals: ['Choose hit tests, overlaps, sweeps, or a physics world', 'Keep coordinate space and continuous-motion limitations explicit'],
        prerequisites: ['runtime/scene-graph'],
        examples: ['showcase/rectangles-collision'],
        apiLinks: ['bounds', 'circle'],
      },
      {
        path: 'physics/physics-basics',
        level: 'intermediate',
        learningGoals: ['Bind visible nodes to a scene-owned physics world', 'Choose exactly one clock and preserve rotation and interpolation conventions'],
        prerequisites: ['runtime/scenes-and-lifecycle'],
        examples: [],
        apiLinks: ['physics-world', 'physics-body', 'collider', 'box-shape', 'circle-shape', 'physics-binding'],
      },
      {
        path: 'physics/joints-and-dynamics',
        level: 'advanced',
        learningGoals: ['Choose a joint or contact policy for the intended motion', 'Understand fast-body, shape, event, and solver limitations'],
        prerequisites: ['physics/physics-basics'],
        examples: [],
        apiLinks: ['joint', 'distance-joint', 'revolute-joint', 'weld-joint', 'prismatic-joint', 'wheel-joint', 'mouse-joint', 'physics-world'],
      },
      {
        path: 'pathfinding/grid-pathfinding',
        level: 'intermediate',
        learningGoals: ['Build a weighted navigation grid and interpret query results', 'Separate path search budgets from movement and collision'],
        prerequisites: ['runtime/coordinates-and-views'],
        examples: ['pathfinding/grid-navigation', 'pathfinding/tilemap-navigation'],
        apiLinks: ['pathfinder', 'grid-space', 'grid-space-options', 'path-result', 'find-path-options'],
      },
      {
        path: 'pathfinding/waypoint-graphs',
        level: 'advanced',
        learningGoals: [
          'Represent authored routes and directed traversal edges',
          'Invalidate stale handles and implement domain-specific traversal separately',
        ],
        prerequisites: ['pathfinding/grid-pathfinding'],
        examples: [],
        apiLinks: ['waypoint-graph', 'waypoint-edge-options', 'path-edge', 'navigation-space'],
      },
      {
        path: 'runtime/serialization-and-prefabs',
        level: 'advanced',
        learningGoals: ['Separate persistent state from a live scene graph', 'Load referenced assets and validate authored or saved data before instantiation'],
        prerequisites: ['runtime/scene-graph', 'assets/loading-and-resources'],
        examples: [],
        apiLinks: ['scene', 'prefab', 'web-storage-store', 'serialization-registry', 'scene-node'],
      },
    ],
  },
  {
    slug: 'recipes',
    title: 'Build a complete interaction',
    description: 'Combine established concepts without inventing a second runtime model.',
    chapters: [
      {
        path: 'recipes/camera-follow-and-parallax',
        level: 'intermediate',
        learningGoals: [
          'Smooth a world-space camera target without frame-dependent overshoot',
          'Compose parallax layers without moving authoritative gameplay state',
        ],
        prerequisites: ['runtime/coordinates-and-views'],
        examples: ['scene-graph/parallax-starfield'],
        apiLinks: [],
      },
      {
        path: 'recipes/pause-menu',
        level: 'intermediate',
        learningGoals: [
          'Pause gameplay while keeping the intended controls usable',
          'Release the modal UI and its owned effects without changing unrelated state',
        ],
        prerequisites: ['runtime/scenes-and-lifecycle', 'runtime/ui-and-widgets'],
        examples: ['showcase/pause-blur'],
        apiLinks: [],
      },
      {
        path: 'recipes/game-feel',
        level: 'intermediate',
        learningGoals: ['Combine bounded visual and audio feedback for a gameplay event', 'Prevent overlapping effects from fighting over shared properties'],
        prerequisites: ['rendering/animation', 'audio/audio-basics'],
        examples: ['showcase/screen-shake-on-explosion', 'showcase/gamepad-spaceship'],
        apiLinks: [],
      },
      {
        path: 'recipes/ui-patterns',
        level: 'intermediate',
        learningGoals: ['Implement dialogue reveal and deliberate advance behavior', 'Keep choices, focus, text boundaries, and cancellation explicit'],
        prerequisites: ['runtime/ui-and-widgets', 'input/keyboard-and-actions'],
        examples: ['showcase/dialog-system'],
        apiLinks: [],
      },
      {
        path: 'recipes/cinematics',
        level: 'intermediate',
        learningGoals: [
          'Coordinate a skippable sequence with one terminal state',
          'Cancel only the sequence-owned work and preserve the intended gameplay lifetime',
        ],
        prerequisites: ['rendering/animation', 'runtime/scenes-and-lifecycle'],
        examples: ['showcase/boss-intro-cinematic'],
        apiLinks: [],
      },
      {
        path: 'recipes/build-orb-dodge',
        level: 'intermediate',
        learningGoals: [
          'Connect input, spawning, overlap checks, and score into a complete game',
          'Read the maintained example as a composition of the Guide concepts',
        ],
        prerequisites: ['input/keyboard-and-actions', 'rendering/sprites', 'recipes/gameplay-collision'],
        examples: ['showcase/orb-dodge'],
        apiLinks: ['scene', 'graphics', 'keyboard', 'text', 'color'],
      },
    ],
  },
  {
    slug: 'shipping',
    title: 'Diagnose and ship',
    description: 'Find the failing boundary, measure the right work, and verify the deployed build.',
    chapters: [
      {
        path: 'shipping/troubleshooting',
        level: 'intro',
        learningGoals: ['Trace a visible failure to its first observable cause', 'Produce a minimal reproduction with versions and backend context'],
        prerequisites: ['getting-started/setup'],
        examples: ['performance/backend-comparison', 'input/keyboard', 'input/gamepad', 'audio-basics/play-sound'],
        apiLinks: [],
      },
      {
        path: 'debugging/debugging-and-inspection',
        level: 'intermediate',
        learningGoals: ['Inspect drawing, interaction, and filter structure', 'Distinguish diagnostic estimates from GPU measurements'],
        prerequisites: ['getting-started/your-first-scene'],
        examples: ['performance/backend-comparison', 'debug-layer/pointer-and-hittest', 'render-targets/render-pipeline'],
        apiLinks: ['debug-overlay', 'performance-layer', 'bounding-boxes-layer', 'hit-test-layer', 'render-pass-inspector-layer'],
      },
      {
        path: 'debugging/performance',
        level: 'intermediate',
        learningGoals: ['Separate simulation, submission, pixel work, and memory', 'Measure a controlled production workload before keeping an optimization'],
        prerequisites: ['debugging/debugging-and-inspection'],
        examples: ['performance/backend-comparison', 'particles/gpu-particles'],
        apiLinks: ['performance-layer'],
      },
      {
        path: 'debugging/backend-comparison',
        level: 'advanced',
        learningGoals: [
          'Understand automatic selection and explicit backend requirements',
          'Read parity evidence without turning it into a universal support guarantee',
        ],
        prerequisites: ['getting-started/your-first-scene'],
        examples: ['performance/backend-comparison'],
        apiLinks: ['capabilities'],
      },
      {
        path: 'shipping/deployment',
        level: 'intermediate',
        learningGoals: [
          'Build and host static output with the correct asset base',
          'Verify production headers, capabilities, and failure paths on target devices',
        ],
        prerequisites: ['getting-started/setup'],
        examples: [],
        apiLinks: [],
      },
      {
        path: 'shipping/typed-worklets-and-workers',
        level: 'advanced',
        learningGoals: ['Keep worker and worklet code in the correct execution environment', 'Own asynchronous startup, messages, and teardown'],
        prerequisites: ['getting-started/setup'],
        examples: [],
        apiLinks: [],
      },
      {
        path: 'shipping/typed-shaders',
        level: 'advanced',
        learningGoals: ['Import shader files through the build pipeline', 'Separate typed source imports from actual GPU program validation'],
        prerequisites: ['effects/custom-mesh-shaders'],
        examples: [],
        apiLinks: [],
      },
    ],
  },
  {
    slug: 'extending',
    title: 'Integrate and extend',
    description: 'Embed ExoJS or add a supported extension point only when the existing workflow is insufficient.',
    chapters: [
      {
        path: 'integrations/react',
        level: 'intermediate',
        learningGoals: [
          'Let React own the host and ExoJS own the canvas runtime',
          'Handle reactive options and teardown without recreating the engine per render',
        ],
        prerequisites: ['runtime/scenes-and-lifecycle'],
        examples: [],
        apiLinks: ['application', 'scene'],
      },
      {
        path: 'debugging/authoring-extensions',
        level: 'advanced',
        learningGoals: [
          'Package explicit renderer, asset, and serializer contributions',
          'Handle installation, rollback, disposal, and compatible peer versions',
        ],
        prerequisites: ['runtime/application'],
        examples: ['custom-renderers/custom-triangle-renderer', 'particles/emitter-basics'],
        apiLinks: ['extension', 'application', 'application-options'],
      },
      {
        path: 'debugging/custom-renderers',
        level: 'advanced',
        learningGoals: ['Choose the smallest rendering extension point that fits', 'Respect composed pass state and recover caller-owned GPU resources'],
        prerequisites: ['rendering/render-targets', 'effects/custom-mesh-shaders'],
        examples: ['render-targets/render-pipeline', 'custom-renderers/custom-triangle-renderer'],
        apiLinks: [],
      },
      {
        path: 'debugging/renderer-sdk-contract',
        level: 'advanced',
        learningGoals: [
          'Implement recording and recovery against the supported renderer SDK',
          'Honor retained generations, borrowed buffers, and pass coordination',
        ],
        prerequisites: ['debugging/custom-renderers'],
        examples: [],
        apiLinks: [],
      },
      {
        path: 'runtime/writing-your-own-transition',
        level: 'advanced',
        learningGoals: [
          'Separate a reusable transition definition from per-navigation state',
          'Handle commit, abort, borrowed frames, and cleanup exactly once',
        ],
        prerequisites: ['runtime/scenes-and-lifecycle', 'rendering/render-targets'],
        examples: ['application-scenes/custom-transition', 'application-scenes/multiple-scenes'],
        apiLinks: ['scene-transition', 'phased-scene-transition', 'scene-transition-session', 'scene-transition-lifecycle-error', 'scene-director'],
      },
    ],
  },
];

export const GUIDE_PARTS: ReadonlyArray<GuidePartMeta> = RAW_PARTS.map((part, partIndex) => ({
  part: partIndex + 1,
  slug: part.slug,
  title: part.title,
  description: part.description,
  chapters: part.chapters.map((chapter, chapterIndex) => ({
    ...chapter,
    part: partIndex + 1,
    chapter: chapterIndex + 1,
    partSlug: part.slug,
    partTitle: part.title,
    slug: chapter.path.split('/').at(-1)!,
  })),
}));
export const GUIDE_CHAPTERS: ReadonlyArray<GuideChapterMeta> = GUIDE_PARTS.flatMap(part => part.chapters);
export const GUIDE_CHAPTER_BY_PATH: ReadonlyMap<string, GuideChapterMeta> = new Map(GUIDE_CHAPTERS.map(chapter => [chapter.path, chapter]));
export const GUIDE_PART_BY_SLUG: ReadonlyMap<string, GuidePartMeta> = new Map(GUIDE_PARTS.map(part => [part.slug, part]));
export interface LearningPathStep {
  path: string;
  goal: string;
  example?: string;
}
export interface GuideTopic {
  title: string;
  description: string;
  path: string;
}
export const getAdjacentChapters = (path: string): { previous: GuideChapterMeta | null; next: GuideChapterMeta | null } => {
  const index = GUIDE_CHAPTERS.findIndex(chapter => chapter.path === path);
  return index < 0 ? { previous: null, next: null } : { previous: GUIDE_CHAPTERS[index - 1] ?? null, next: GUIDE_CHAPTERS[index + 1] ?? null };
};
export const isGuidePath = (path: string): boolean => GUIDE_CHAPTER_BY_PATH.has(path);

export const GUIDE_LEARNING_PATH: ReadonlyArray<LearningPathStep> = [
  {
    path: 'getting-started/what-is-exojs',
    goal: 'Understand the runtime and choose the right documentation surface.',
    example: 'getting-started/hello-world',
  },
  {
    path: 'getting-started/setup',
    goal: 'Create a typed starter and locate its entry point and scene.',
  },
  {
    path: 'getting-started/your-first-scene',
    goal: 'Draw and animate an object before introducing external assets.',
    example: 'getting-started/hello-world',
  },
  {
    path: 'runtime/scenes-and-lifecycle',
    goal: 'Place loading, updates, pause, and cleanup at the right lifetime.',
    example: 'application-scenes/multiple-scenes',
  },
  {
    path: 'input/keyboard-and-actions',
    goal: 'Connect physical controls to gameplay actions.',
    example: 'input/action-mapping',
  },
  {
    path: 'assets/loading-and-resources',
    goal: 'Load required resources and give them an explicit owner.',
    example: 'application-scenes/loading-screen',
  },
  {
    path: 'rendering/sprites',
    goal: 'Place and render texture-backed content.',
    example: 'sprites-textures/sprite-basics',
  },
  {
    path: 'audio/audio-basics',
    goal: 'Start audio from a user gesture and own its voices.',
    example: 'audio-basics/play-sound',
  },
  {
    path: 'debugging/debugging-and-inspection',
    goal: 'Inspect a failing drawing or interaction boundary.',
    example: 'debug-layer/pointer-and-hittest',
  },
  {
    path: 'shipping/deployment',
    goal: 'Build and verify the hosted production application.',
  },
];
export const GUIDE_TOPICS: ReadonlyArray<GuideTopic> = [
  {
    title: 'Understand scene ownership',
    description: 'Translate familiar engine concepts into ExoJS loading, pause, retention, and teardown.',
    path: 'runtime/scenes-and-lifecycle',
  },
  {
    title: 'Build a complete game',
    description: 'Combine input, spawning, collision, and score in the maintained Orb Dodge example.',
    path: 'recipes/build-orb-dodge',
  },
  {
    title: 'Build a HUD or menu',
    description: 'Use retained widgets, layout, focus, and deliberate DOM integration.',
    path: 'runtime/ui-and-widgets',
  },
  {
    title: 'Load and stream worlds',
    description: 'Turn authored maps and objects into independently owned levels.',
    path: 'assets/worlds-and-spawning',
  },
  {
    title: 'Create visual effects',
    description: 'Choose materials, filters, particles, or lighting without starting from raw GPU code.',
    path: 'effects/filters',
  },
  {
    title: 'Build audio-reactive visuals',
    description: 'Map live analysis and beat estimates into bounded visual changes.',
    path: 'audio/audio-reactive-visualization',
  },
  {
    title: 'Find a failure',
    description: 'Start with the observed symptom and inspect the relevant runtime boundary.',
    path: 'shipping/troubleshooting',
  },
  {
    title: 'Measure performance',
    description: 'Separate CPU, GPU, memory, and frame pacing before optimizing.',
    path: 'debugging/performance',
  },
  {
    title: 'Embed in React',
    description: 'Keep React hosting and ExoJS runtime ownership distinct.',
    path: 'integrations/react',
  },
  {
    title: 'Ship the application',
    description: 'Check the production build, asset URLs, policies, and target devices.',
    path: 'shipping/deployment',
  },
];
export const CORE_ONBOARDING_PATHS: ReadonlyArray<string> = [
  'getting-started/what-is-exojs',
  'getting-started/setup',
  'getting-started/your-first-scene',
  'runtime/scenes-and-lifecycle',
  'input/keyboard-and-actions',
  'assets/loading-and-resources',
  'rendering/sprites',
  'audio/audio-basics',
  'debugging/debugging-and-inspection',
  'shipping/deployment',
];
