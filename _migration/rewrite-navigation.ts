import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = JSON.parse(readFileSync('_migration/source.json', 'utf8')).sourceCommit as string;
const sourcePath = '_migration/.guide-structure-source.ts';
writeFileSync(sourcePath, execFileSync('git', ['show', `${source}:site/src/lib/guide-structure.ts`]));
const original = await import(pathToFileURL(resolve(sourcePath)).href);
unlinkSync(sourcePath);
const byPath = new Map<string, any>(original.GUIDE_CHAPTERS.map((chapter: any) => [chapter.path, chapter]));
assert.equal(byPath.size, 67, 'Unexpected audited Guide inventory');

const merges: Record<string, string> = {
  'getting-started/project-structure': 'getting-started/setup',
  'recipes/hud-overlay': 'runtime/ui-and-widgets',
  'recipes/split-screen': 'runtime/coordinates-and-views',
  'recipes/audio-reactive-scene': 'audio/audio-reactive-visualization',
};
const aliases = new Map<string, string>();
for (const match of readFileSync('site/src/lib/example-aliases.ts', 'utf8').matchAll(/'([^']+\.js)':\s*'([^']+\.js)'/g)) {
  aliases.set(match[1].slice(0, -3), match[2].slice(0, -3));
}
const catalog = JSON.parse(readFileSync('examples/examples.json', 'utf8'));
const canonical = new Set<string>(Object.values(catalog).flatMap((entries: any) => entries.map((entry: any) => entry.path.replace(/\.js$/, ''))));
const example = (value: string): string => {
  let result = value.replace(/\.js$/, '');
  const visited = new Set<string>();
  while (aliases.has(result)) {
    assert(!visited.has(result), `Alias cycle: ${result}`);
    visited.add(result);
    result = aliases.get(result)!;
  }
  assert(canonical.has(result), `Not a canonical example: ${value} -> ${result}`);
  return result;
};

const groups = [
  ['getting-started', 'Start here', 'Create a working scene and understand the canvas you are building on.', 'getting-started/what-is-exojs getting-started/setup getting-started/your-first-scene getting-started/resize-dpr-and-canvas'],
  ['runtime', 'Runtime and interaction', 'Own scene lifetimes, compose objects, and route input into a usable interface.', 'runtime/application runtime/scenes-and-lifecycle runtime/scene-graph runtime/coordinates-and-views input/keyboard-and-actions input/mouse-and-pointer input/gamepad input/chords-and-sequences runtime/ui-and-widgets'],
  ['assets', 'Assets and worlds', 'Acquire resources through an owner and turn authored data into streamable content.', 'assets/loading-and-resources assets/asset-catalogs assets/device-variants assets/offline assets/aseprite assets/tiled-maps assets/ldtk assets/worlds-and-spawning rendering/infinite-maps'],
  ['rendering', 'Drawing and composition', 'Choose a drawable, understand its coordinate space, and compose targets without losing ownership.', 'rendering/graphics rendering/sprites rendering/text rendering/pixel-snapping rendering/render-targets rendering/retained-containers rendering/immediate-mode'],
  ['effects', 'Animation and visual effects', 'Animate existing state and choose effects with explicit capability and cost boundaries.', 'rendering/animation effects/filters effects/post-processing effects/particles effects/lighting effects/custom-mesh-shaders'],
  ['audio', 'Audio and timing', 'Play owned voices, route effects, and connect audio analysis to presentation.', 'audio/audio-basics audio/spatial-audio audio/audio-effects audio/beat-detection audio/audio-reactive-visualization'],
  ['gameplay', 'Gameplay systems', 'Choose geometry queries, simulation, navigation, or serialization for the task at hand.', 'recipes/gameplay-collision physics/physics-basics physics/joints-and-dynamics pathfinding/grid-pathfinding pathfinding/waypoint-graphs runtime/serialization-and-prefabs'],
  ['recipes', 'Build a complete interaction', 'Combine established concepts without inventing a second runtime model.', 'recipes/camera-follow-and-parallax recipes/pause-menu recipes/game-feel recipes/ui-patterns recipes/cinematics recipes/build-orb-dodge'],
  ['shipping', 'Diagnose and ship', 'Find the failing boundary, measure the right work, and verify the deployed build.', 'shipping/troubleshooting debugging/debugging-and-inspection debugging/performance debugging/backend-comparison shipping/deployment shipping/typed-worklets-and-workers shipping/typed-shaders'],
  ['extending', 'Integrate and extend', 'Embed ExoJS or add a supported extension point only when the existing workflow is insufficient.', 'integrations/react debugging/authoring-extensions debugging/custom-renderers debugging/renderer-sdk-contract runtime/writing-your-own-transition'],
] as const;

const goals: Record<string, string[]> = {
  'getting-started/what-is-exojs': ['Decide whether a code-first canvas runtime fits the project', 'Distinguish the Guide, Playground, package README, and API reference'],
  'getting-started/setup': ['Run a starter and choose among the current templates', 'Locate startup, scene code, public assets, and production output'],
  'getting-started/your-first-scene': ['Draw a visible object without external assets', 'Separate scene setup, time-based updates, and explicit world rendering'],
  'getting-started/resize-dpr-and-canvas': ['Distinguish logical canvas size from CSS and backing pixels', 'Choose a sizing policy and handle resize without moving every object manually'],
  'runtime/application': ['Give the canvas and application services a clear host lifetime', 'Await startup and distinguish stop from permanent teardown'],
  'runtime/scenes-and-lifecycle': ['Place asynchronous loading and synchronous updates in the correct hooks', 'Distinguish ownership, ordinary pause, retention, and final teardown'],
  'runtime/scene-graph': ['Compose local transforms through a parent hierarchy', 'Separate hierarchy, rendering order, and resource ownership'],
  'runtime/coordinates-and-views': ['Convert between local, world, and logical canvas coordinates', 'Render one world through independent views without duplicating simulation'],
  'input/keyboard-and-actions': ['Bind physical controls to named gameplay actions', 'Use held values and transition signals with scene availability'],
  'input/mouse-and-pointer': ['Convert pointer coordinates through the intended view', 'Handle capture, gestures, cancellation, and pointer lifetime'],
  'input/gamepad': ['Assign a connected controller and bind its controls', 'Handle disconnection, analog values, and optional haptics'],
  'input/chords-and-sequences': ['Choose simultaneous chords or ordered input sequences', 'Handle sequence timing, cancellation, and progress correctly'],
  'runtime/ui-and-widgets': ['Build a screen-fixed HUD using owned widgets', 'Coordinate layout, focus, modal interaction, and DOM accessibility'],
  'assets/loading-and-resources': ['Choose awaited loading or a deliberate placeholder', 'Release independent resource claims through their owning scope'],
  'assets/asset-catalogs': ['Compose named asset definitions without eagerly fetching them', 'Distinguish deferred catalog leaves from resolved values and validated data'],
  'assets/device-variants': ['Select an asset source using actual capabilities', 'Keep a usable fallback and distinguish compression format from container'],
  'assets/offline': ['Separate resident resources from persistent source caching', 'Handle connectivity without assuming the entire application is offline-ready'],
  'assets/aseprite': ['Load an Aseprite export and choose an authored animation tag', 'Handle frame timing, atlas layout, and resource lifetime'],
  'assets/tiled-maps': ['Load and render a Tiled JSON map through the generic tilemap runtime', 'Distinguish visible tiles, authored objects, collision, and streaming'],
  'assets/ldtk': ['Choose eager map loading or project-driven level loading', 'Resolve external levels and keep level resources independently owned'],
  'assets/worlds-and-spawning': ['Spawn owned game objects from authored level data', 'Unload a level and handle failed or cancelled acquisition safely'],
  'rendering/infinite-maps': ['Separate a map source from resident rendered chunks', 'Budget streaming work and clean up a chunk source at the owner boundary'],
  'rendering/graphics': ['Create reusable geometry in local coordinates', 'Change geometry deliberately instead of rebuilding unchanged shapes every frame'],
  'rendering/sprites': ['Place a texture-backed drawable with intentional anchor and sampling', 'Distinguish image data, atlas frames, and shared texture lifetime'],
  'rendering/text': ['Choose text rendering and load the required font', 'Distinguish layout, ink bounds, wrapping, and shaping constraints'],
  'rendering/pixel-snapping': ['Choose position or geometry snapping for the intended image', 'Keep rendering alignment separate from simulation coordinates'],
  'rendering/render-targets': ['Render into an owned texture with scoped target state', 'Handle resizing, feedback, and borrowed output textures safely'],
  'rendering/retained-containers': ['Choose retained recording instead of texture caching for the right workload', 'Understand structural invalidation, row updates, and reuse limits'],
  'rendering/immediate-mode': ['Submit procedural drawing through a reusable immediate-mode path', 'Keep packed buffers, transforms, and their lifetimes explicit'],
  'rendering/animation': ['Choose frame animation or property interpolation', 'Handle repeat semantics, pause policy, and competing animations'],
  'effects/filters': ['Choose a node, group, or frame effect boundary', 'Own filter resources and distinguish logical effects from hardware passes'],
  'effects/post-processing': ['Compose frame passes and filters in an explicit order', 'Avoid read-write feedback and restore scoped rendering state'],
  'effects/particles': ['Build a bounded scene-owned emitter in local space', 'Inspect CPU/GPU routing and handle changes that restart live particles'],
  'effects/lighting': ['Choose a lighting model rather than an assumed quality tier', 'Register lights, shadows, and normal sources with correct ownership'],
  'effects/custom-mesh-shaders': ['Use material schemas and backend shader counterparts', 'Separate host-side types from shader compilation and visual validation'],
  'audio/audio-basics': ['Distinguish a loaded audio asset from a playing voice', 'Unlock playback and choose the voice and bus lifetime'],
  'audio/spatial-audio': ['Map world positions into a consistent audio space', 'Own listener and source updates without conflating pan with volume'],
  'audio/audio-effects': ['Route an effect chain without duplicating the dry signal accidentally', 'Own effect nodes and handle asynchronous worklet or impulse loading'],
  'audio/beat-detection': ['Tap live audio and distinguish acquisition from a locked estimate', 'Use timing and confidence without treating detection as an authoritative beatmap'],
  'audio/audio-reactive-visualization': ['Map one live analysis stream into bounded visual changes', 'Correlate audio time with presentation and own spectrum-history textures'],
  'recipes/gameplay-collision': ['Choose hit tests, overlaps, sweeps, or a physics world', 'Keep coordinate space and continuous-motion limitations explicit'],
  'physics/physics-basics': ['Bind visible nodes to a scene-owned physics world', 'Choose exactly one clock and preserve rotation and interpolation conventions'],
  'physics/joints-and-dynamics': ['Choose a joint or contact policy for the intended motion', 'Understand fast-body, shape, event, and solver limitations'],
  'pathfinding/grid-pathfinding': ['Build a weighted navigation grid and interpret query results', 'Separate path search budgets from movement and collision'],
  'pathfinding/waypoint-graphs': ['Represent authored routes and directed traversal edges', 'Invalidate stale handles and implement domain-specific traversal separately'],
  'runtime/serialization-and-prefabs': ['Separate persistent state from a live scene graph', 'Load referenced assets and validate authored or saved data before instantiation'],
  'recipes/camera-follow-and-parallax': ['Smooth a world-space camera target without frame-dependent overshoot', 'Compose parallax layers without moving authoritative gameplay state'],
  'recipes/pause-menu': ['Pause gameplay while keeping the intended controls usable', 'Release the modal UI and its owned effects without changing unrelated state'],
  'recipes/game-feel': ['Combine bounded visual and audio feedback for a gameplay event', 'Prevent overlapping effects from fighting over shared properties'],
  'recipes/ui-patterns': ['Implement dialogue reveal and deliberate advance behavior', 'Keep choices, focus, text boundaries, and cancellation explicit'],
  'recipes/cinematics': ['Coordinate a skippable sequence with one terminal state', 'Cancel only the sequence-owned work and preserve the intended gameplay lifetime'],
  'recipes/build-orb-dodge': ['Connect input, spawning, overlap checks, and score into a complete game', 'Read the maintained example as a composition of the Guide concepts'],
  'shipping/troubleshooting': ['Trace a visible failure to its first observable cause', 'Produce a minimal reproduction with versions and backend context'],
  'debugging/debugging-and-inspection': ['Inspect drawing, interaction, and filter structure', 'Distinguish diagnostic estimates from GPU measurements'],
  'debugging/performance': ['Separate simulation, submission, pixel work, and memory', 'Measure a controlled production workload before keeping an optimization'],
  'debugging/backend-comparison': ['Understand automatic selection and explicit backend requirements', 'Read parity evidence without turning it into a universal support guarantee'],
  'shipping/deployment': ['Build and host static output with the correct asset base', 'Verify production headers, capabilities, and failure paths on target devices'],
  'shipping/typed-worklets-and-workers': ['Keep worker and worklet code in the correct execution environment', 'Own asynchronous startup, messages, and teardown'],
  'shipping/typed-shaders': ['Import shader files through the build pipeline', 'Separate typed source imports from actual GPU program validation'],
  'integrations/react': ['Let React own the host and ExoJS own the canvas runtime', 'Handle reactive options and teardown without recreating the engine per render'],
  'debugging/authoring-extensions': ['Package explicit renderer, asset, and serializer contributions', 'Handle installation, rollback, disposal, and compatible peer versions'],
  'debugging/custom-renderers': ['Choose the smallest rendering extension point that fits', 'Respect composed pass state and recover caller-owned GPU resources'],
  'debugging/renderer-sdk-contract': ['Implement recording and recovery against the supported renderer SDK', 'Honor retained generations, borrowed buffers, and pass coordination'],
  'runtime/writing-your-own-transition': ['Separate a reusable transition definition from per-navigation state', 'Handle commit, abort, borrowed frames, and cleanup exactly once'],
};

const prerequisites: Record<string, string[]> = {
  'getting-started/what-is-exojs': [],
  'getting-started/setup': ['getting-started/what-is-exojs'],
  'getting-started/your-first-scene': ['getting-started/setup'],
  'getting-started/resize-dpr-and-canvas': ['getting-started/your-first-scene'],
  'runtime/application': ['getting-started/your-first-scene'],
  'runtime/scenes-and-lifecycle': ['getting-started/your-first-scene'],
  'runtime/scene-graph': ['runtime/scenes-and-lifecycle'],
  'runtime/coordinates-and-views': ['runtime/scene-graph'],
  'input/keyboard-and-actions': ['runtime/scenes-and-lifecycle'],
  'input/mouse-and-pointer': ['runtime/coordinates-and-views', 'input/keyboard-and-actions'],
  'input/gamepad': ['input/keyboard-and-actions'],
  'input/chords-and-sequences': ['input/keyboard-and-actions'],
  'runtime/ui-and-widgets': ['runtime/scenes-and-lifecycle', 'input/keyboard-and-actions'],
  'assets/loading-and-resources': ['runtime/scenes-and-lifecycle'],
  'assets/asset-catalogs': ['assets/loading-and-resources'],
  'assets/device-variants': ['assets/loading-and-resources'],
  'assets/offline': ['assets/loading-and-resources'],
  'assets/aseprite': ['assets/loading-and-resources', 'rendering/sprites'],
  'assets/tiled-maps': ['assets/loading-and-resources'],
  'assets/ldtk': ['assets/loading-and-resources'],
  'assets/worlds-and-spawning': ['assets/tiled-maps', 'assets/loading-and-resources'],
  'rendering/infinite-maps': ['assets/tiled-maps'],
  'rendering/graphics': ['getting-started/your-first-scene'],
  'rendering/sprites': ['assets/loading-and-resources'],
  'rendering/text': ['assets/loading-and-resources', 'runtime/scene-graph'],
  'rendering/pixel-snapping': ['rendering/sprites', 'getting-started/resize-dpr-and-canvas'],
  'rendering/render-targets': ['runtime/coordinates-and-views', 'rendering/sprites'],
  'rendering/retained-containers': ['runtime/scene-graph', 'debugging/performance'],
  'rendering/immediate-mode': ['rendering/graphics'],
  'rendering/animation': ['runtime/scenes-and-lifecycle', 'rendering/sprites'],
  'effects/filters': ['rendering/sprites'],
  'effects/post-processing': ['effects/filters', 'rendering/render-targets'],
  'effects/particles': ['runtime/scenes-and-lifecycle'],
  'effects/lighting': ['runtime/scenes-and-lifecycle', 'rendering/sprites'],
  'effects/custom-mesh-shaders': ['rendering/graphics', 'rendering/sprites'],
  'audio/audio-basics': ['assets/loading-and-resources'],
  'audio/spatial-audio': ['audio/audio-basics', 'runtime/coordinates-and-views'],
  'audio/audio-effects': ['audio/audio-basics'],
  'audio/beat-detection': ['audio/audio-basics'],
  'audio/audio-reactive-visualization': ['audio/audio-basics', 'audio/beat-detection'],
  'recipes/gameplay-collision': ['runtime/scene-graph'],
  'physics/physics-basics': ['runtime/scenes-and-lifecycle'],
  'physics/joints-and-dynamics': ['physics/physics-basics'],
  'pathfinding/grid-pathfinding': ['runtime/coordinates-and-views'],
  'pathfinding/waypoint-graphs': ['pathfinding/grid-pathfinding'],
  'runtime/serialization-and-prefabs': ['runtime/scene-graph', 'assets/loading-and-resources'],
  'recipes/camera-follow-and-parallax': ['runtime/coordinates-and-views'],
  'recipes/pause-menu': ['runtime/scenes-and-lifecycle', 'runtime/ui-and-widgets'],
  'recipes/game-feel': ['rendering/animation', 'audio/audio-basics'],
  'recipes/ui-patterns': ['runtime/ui-and-widgets', 'input/keyboard-and-actions'],
  'recipes/cinematics': ['rendering/animation', 'runtime/scenes-and-lifecycle'],
  'recipes/build-orb-dodge': ['input/keyboard-and-actions', 'rendering/sprites', 'recipes/gameplay-collision'],
  'shipping/troubleshooting': ['getting-started/setup'],
  'debugging/debugging-and-inspection': ['getting-started/your-first-scene'],
  'debugging/performance': ['debugging/debugging-and-inspection'],
  'debugging/backend-comparison': ['getting-started/your-first-scene'],
  'shipping/deployment': ['getting-started/setup'],
  'shipping/typed-worklets-and-workers': ['getting-started/setup'],
  'shipping/typed-shaders': ['effects/custom-mesh-shaders'],
  'integrations/react': ['runtime/scenes-and-lifecycle'],
  'debugging/authoring-extensions': ['runtime/application'],
  'debugging/custom-renderers': ['rendering/render-targets', 'effects/custom-mesh-shaders'],
  'debugging/renderer-sdk-contract': ['debugging/custom-renderers'],
  'runtime/writing-your-own-transition': ['runtime/scenes-and-lifecycle', 'rendering/render-targets'],
};
const rawParts = groups.map(([slug, title, description, list]) => ({
  slug, title, description,
  chapters: list.split(' ').map(path => {
    const base = byPath.get(path);
    assert(base || path === 'assets/asset-catalogs', `Unknown chapter: ${path}`);
    let examples = (base?.examples ?? ['sprites-textures/asset-catalogs']).filter((value: string) => value.replace(/\.js$/, '') !== 'debug-layer/asset-browser');
    if (path === 'effects/lighting') examples = ['lighting/shadow-casters', 'lighting/lightmap-normals', 'lighting/radiance-rooms'];
    if (path === 'runtime/ui-and-widgets') examples = ['ui/hud-and-widgets', 'ui/settings-menu', 'ui/text-entry-and-scrolling'];
    if (path === 'audio/audio-reactive-visualization') examples = ['showcase/audio-visualisation', 'beat-detection/beat-sync-pulse', 'showcase/audio-reactive-particles'];
    if (path === 'runtime/coordinates-and-views') examples = ['application-scenes/world-vs-screen-coords', 'application-scenes/multi-view-split-screen', 'application-scenes/picture-in-picture'];
    if (path === 'getting-started/your-first-scene') examples = ['getting-started/hello-world'];
    assert(goals[path]?.length && prerequisites[path], `Missing learning metadata: ${path}`);
    return { path, level: base?.level ?? 'intermediate', learningGoals: goals[path], prerequisites: prerequisites[path], examples: [...new Set(examples.map(example))], apiLinks: base?.apiLinks ?? ['assets', 'asset', 'loader-scope', 'asset-ref'] };
  }),
}));
const finalPaths = new Set(rawParts.flatMap(part => part.chapters.map(chapter => chapter.path)));
assert.equal(finalPaths.size, 64);
assert.equal(rawParts.reduce((n, part) => n + part.chapters.length, 0), 64);
for (const chapter of rawParts.flatMap(part => part.chapters)) {
  for (const prerequisite of chapter.prerequisites) assert(finalPaths.has(prerequisite), `Missing prerequisite ${prerequisite}`);
}
const visit = (path: string, stack: Set<string>, complete: Set<string>): void => {
  assert(!stack.has(path), `Prerequisite cycle at ${path}`);
  if (complete.has(path)) return;
  stack.add(path);
  for (const prerequisite of prerequisites[path]) visit(prerequisite, stack, complete);
  stack.delete(path);
  complete.add(path);
};
const completed = new Set<string>();
for (const path of finalPaths) visit(path, new Set(), completed);

const learningPath = [
  { path: 'getting-started/what-is-exojs', goal: 'Understand the runtime and choose the right documentation surface.', example: 'getting-started/hello-world' },
  { path: 'getting-started/setup', goal: 'Create a typed starter and locate its entry point and scene.' },
  { path: 'getting-started/your-first-scene', goal: 'Draw and animate an object before introducing external assets.', example: 'getting-started/hello-world' },
  { path: 'runtime/scenes-and-lifecycle', goal: 'Place loading, updates, pause, and cleanup at the right lifetime.', example: 'application-scenes/multiple-scenes' },
  { path: 'input/keyboard-and-actions', goal: 'Connect physical controls to gameplay actions.', example: 'input/action-mapping' },
  { path: 'assets/loading-and-resources', goal: 'Load required resources and give them an explicit owner.', example: 'application-scenes/loading-screen' },
  { path: 'rendering/sprites', goal: 'Place and render texture-backed content.', example: 'sprites-textures/sprite-basics' },
  { path: 'audio/audio-basics', goal: 'Start audio from a user gesture and own its voices.', example: 'audio-basics/play-sound' },
  { path: 'debugging/debugging-and-inspection', goal: 'Inspect a failing drawing or interaction boundary.', example: 'debug-layer/pointer-and-hittest' },
  { path: 'shipping/deployment', goal: 'Build and verify the hosted production application.' },
];
const topics = [
  { title: 'Understand scene ownership', description: 'Translate familiar engine concepts into ExoJS loading, pause, retention, and teardown.', path: 'runtime/scenes-and-lifecycle' },
  { title: 'Build a complete game', description: 'Combine input, spawning, collision, and score in the maintained Orb Dodge example.', path: 'recipes/build-orb-dodge' },
  { title: 'Build a HUD or menu', description: 'Use retained widgets, layout, focus, and deliberate DOM integration.', path: 'runtime/ui-and-widgets' },
  { title: 'Load and stream worlds', description: 'Turn authored maps and objects into independently owned levels.', path: 'assets/worlds-and-spawning' },
  { title: 'Create visual effects', description: 'Choose materials, filters, particles, or lighting without starting from raw GPU code.', path: 'effects/filters' },
  { title: 'Build audio-reactive visuals', description: 'Map live analysis and beat estimates into bounded visual changes.', path: 'audio/audio-reactive-visualization' },
  { title: 'Find a failure', description: 'Start with the observed symptom and inspect the relevant runtime boundary.', path: 'shipping/troubleshooting' },
  { title: 'Measure performance', description: 'Separate CPU, GPU, memory, and frame pacing before optimizing.', path: 'debugging/performance' },
  { title: 'Embed in React', description: 'Keep React hosting and ExoJS runtime ownership distinct.', path: 'integrations/react' },
  { title: 'Ship the application', description: 'Check the production build, asset URLs, policies, and target devices.', path: 'shipping/deployment' },
];
const header = `/** Learning-oriented Guide navigation. URLs remain independent of the topic grouping. */\nexport type GuideLevel = 'intro' | 'intermediate' | 'advanced';\nexport const GUIDE_LEVELS: ReadonlyArray<GuideLevel> = ['intro', 'intermediate', 'advanced'];\nexport const GUIDE_LEVEL_LABEL: Record<GuideLevel, string> = { intro: 'Intro', intermediate: 'Intermediate', advanced: 'Advanced' };\ninterface RawChapter { path: string; level: GuideLevel; learningGoals: ReadonlyArray<string>; prerequisites: ReadonlyArray<string>; examples: ReadonlyArray<string>; apiLinks: ReadonlyArray<string>; }\ninterface RawPart { slug: string; title: string; description: string; chapters: ReadonlyArray<RawChapter>; }\nexport interface GuideChapterMeta { part: number; chapter: number; partSlug: string; partTitle: string; slug: string; path: string; level: GuideLevel; learningGoals: ReadonlyArray<string>; prerequisites: ReadonlyArray<string>; examples: ReadonlyArray<string>; apiLinks: ReadonlyArray<string>; }\nexport interface GuidePartMeta { part: number; slug: string; title: string; description: string; chapters: ReadonlyArray<GuideChapterMeta>; }\n`;
const footer = `\nexport const GUIDE_PARTS: ReadonlyArray<GuidePartMeta> = RAW_PARTS.map((part, partIndex) => ({ part: partIndex + 1, slug: part.slug, title: part.title, description: part.description, chapters: part.chapters.map((chapter, chapterIndex) => ({ ...chapter, part: partIndex + 1, chapter: chapterIndex + 1, partSlug: part.slug, partTitle: part.title, slug: chapter.path.split('/').at(-1)! })) }));\nexport const GUIDE_CHAPTERS: ReadonlyArray<GuideChapterMeta> = GUIDE_PARTS.flatMap(part => part.chapters);\nexport const GUIDE_CHAPTER_BY_PATH: ReadonlyMap<string, GuideChapterMeta> = new Map(GUIDE_CHAPTERS.map(chapter => [chapter.path, chapter]));\nexport const GUIDE_PART_BY_SLUG: ReadonlyMap<string, GuidePartMeta> = new Map(GUIDE_PARTS.map(part => [part.slug, part]));\nexport interface LearningPathStep { path: string; goal: string; example?: string; }\nexport interface GuideTopic { title: string; description: string; path: string; }\nexport const getAdjacentChapters = (path: string): { previous: GuideChapterMeta | null; next: GuideChapterMeta | null } => { const index = GUIDE_CHAPTERS.findIndex(chapter => chapter.path === path); return index < 0 ? { previous: null, next: null } : { previous: GUIDE_CHAPTERS[index - 1] ?? null, next: GUIDE_CHAPTERS[index + 1] ?? null }; };\nexport const isGuidePath = (path: string): boolean => GUIDE_CHAPTER_BY_PATH.has(path);\n`;
writeFileSync('site/src/lib/guide-structure.ts', header + `\nconst RAW_PARTS: ReadonlyArray<RawPart> = ${JSON.stringify(rawParts, null, 2)};\n` + footer + `\nexport const GUIDE_LEARNING_PATH: ReadonlyArray<LearningPathStep> = ${JSON.stringify(learningPath, null, 2)};\nexport const GUIDE_TOPICS: ReadonlyArray<GuideTopic> = ${JSON.stringify(topics, null, 2)};\nexport const CORE_ONBOARDING_PATHS: ReadonlyArray<string> = ${JSON.stringify(learningPath.map(step => step.path), null, 2)};\n`);

const textPaths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(path => path && existsSync(path) && /\.(md|mdx|astro|ts|tsx)$/.test(path) && !path.startsWith('_migration/') && !path.startsWith('site/src/content/api/') && !path.startsWith('site/src/lib/example-aliases') && !path.startsWith('examples/') && !path.startsWith('src/') && !path.startsWith('test/') && !path.includes('CHANGELOG') && !path.includes('THIRD_PARTY') && !path.includes('results/'));
const rewrites: string[] = [];
for (const path of textPaths) {
  const before = readFileSync(path, 'utf8');
  let text = before;
  for (const [oldPath, destination] of Object.entries(merges)) {
    text = text.replaceAll(`/guide/${oldPath}/`, `/guide/${destination}/`);
  }
  if (path.endsWith('.mdx') || path.endsWith('.md') || path.endsWith('.astro')) {
    for (const [oldPath, destination] of aliases) {
      text = text.replaceAll(`?example=${oldPath}.js`, `?example=${destination}.js`).replaceAll(`?example=${oldPath})`, `?example=${destination})`).replaceAll(`?example=${oldPath}\"`, `?example=${destination}\"`);
      text = text.replaceAll(`?slug=${oldPath}`, `?example=${destination}`);
      text = text.replaceAll(`'${oldPath}'`, `'${destination}'`);
    }
    text = text.replace(/<ExamplePreview\b[\s\S]*?\/>/g, tag => {
      const chapter = /\bchapter="([^"]+)"/.exec(tag);
      const slug = /\bslug="([^"]+)"/.exec(tag);
      if (!chapter || !slug) return tag;
      const target = example(`${chapter[1]}/${slug[1]}`);
      const slash = target.indexOf('/');
      return tag.replace(chapter[0], `chapter="${target.slice(0, slash)}"`).replace(slug[0], `slug="${target.slice(slash + 1)}"`);
    });
  }
  text = text.replaceAll("'scene-tweens'", "'tween-system'").replaceAll('/api/scene-tweens/', '/api/tween-system/');
  if (text !== before) { writeFileSync(path, text); rewrites.push(path); }
}
for (const path of Object.keys(merges)) {
  const filename = `site/src/content/guide/${path}.mdx`;
  if (existsSync(filename)) unlinkSync(filename);
}
const spectrum = 'examples/guides/audio-reactive-visualization/spectrum-scene.ts';
let spectrumText = readFileSync(spectrum, 'utf8');
if (!spectrumText.includes('private readonly barColor')) {
  spectrumText = spectrumText.replace('private readonly bars = new Graphics();', 'private readonly bars = new Graphics();\n  private readonly barColor = new Color(90, 180, 240);').replace('this.bars.fillColor = new Color(90, 180, 240);', 'this.bars.fillColor = this.barColor;');
  writeFileSync(spectrum, spectrumText);
}
writeFileSync('_migration/navigation-map.json', JSON.stringify({ sourceCommit: source, originalCount: 67, finalCount: 64, merges, parts: rawParts, mechanicallyRewritten: rewrites }, null, 2) + '\n');
console.log(`Navigation: 67 -> 64 chapters, ${rawParts.length} learning parts; ${rewrites.length} files canonicalized.`);
