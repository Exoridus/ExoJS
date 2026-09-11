import * as Phaser from 'phaser';

import { mutationSignature, selectMutationIndices, wobbleOffsetAt } from '../../shared/mutation';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';
import { isParticleLifecycle, isParticles, PARTICLE_ALPHA, PARTICLE_LIFETIME, PARTICLE_STEP, particleSeedAt } from '../particles';
import { isPickingScene, PICK_RECT_SIZE, pickPointAt, pickRectAt } from '../picking';
import {
  createDigitAtlasCanvas,
  createDistinctTextureCanvas,
  createParticleCanvas,
  createTileAtlasCanvas,
  DIGIT_ALPHABET,
  DIGIT_CELL_HEIGHT,
  DIGIT_CELL_WIDTH,
  TEXT_FONT_SIZE,
} from '../sceneAssets';
import type { TilemapExtent } from '../tilemap';
import { isTilemap, isTilemapEditing, TILE_SIZE, tileIdAt, tilemapCameraAt, tilemapCameraFrameFor, tilemapEditsAt, tilemapExtent } from '../tilemap';
import {
  hasFullViewportLeaves,
  isChurning,
  isTextArchetype,
  isTextUpdating,
  leafAlpha,
  pointerQueriesPerFrame,
  textForLeaf,
  usesRenderTargets,
} from '../traits';
import { GRID_MARGIN, gridLayout, gridPosition, isScrolling, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../world';

/**
 * Phaser 4.2 arm of the rendering benchmark.
 *
 * Builds the byte-for-byte same scene the ExoJS and Pixi arms build
 * (`adapters/exojs.ts`, `adapters/pixi.ts`) and mutates the identical leaf set
 * selected by the shared `selectMutationIndices`, exposing the result through
 * {@link EngineAdapter.mutationSignature} so the harness's cross-arm determinism
 * check asserts every arm did the same work. The scene structure
 * (nested-container spine, round-robin leaf distribution, per-bucket texture
 * cycling, overdraw stacking, top-left anchoring) is a faithful transcription of
 * the other arms so the comparison rests on the same neutral archetypes.
 *
 * WEBGL VERSION DISCLOSURE - EMPIRICAL. Phaser 4.2.1's default renderer asks for
 * a WebGL1 context, but its public `GameConfig.context` path accepts a caller-
 * created context. This adapter supplies a real WebGL2 context through that path
 * and verifies after boot that Phaser retained the same object. The fallback path
 * is deliberately not used: a browser without WebGL2 makes this arm unavailable
 * instead of silently changing the measured backend.
 *
 * Phaser 4 ships NO WebGPU renderer (`Phaser.AUTO/CANVAS/WEBGL/HEADLESS` only),
 * so this arm supports the `'webgl2'` backend request only and never runs
 * `'webgpu'`.
 *
 * The harness owns frame cadence, so Phaser's own `requestAnimationFrame` game
 * loop (`TimeStep`) is halted right after boot (`game.loop.stop()`), and one
 * frame is produced by the exact render sequence `Game.step` runs -
 * `renderer.preRender()`, `scene.render(renderer)`, `renderer.postRender()` -
 * with the update/input/physics half of the step deliberately never called, so
 * only Phaser's render path is measured.
 */

/** TextureManager key of the scene the game boots (fixed; the game is destroyed and rebuilt per cell). */
const SCENE_KEY = 'bench';
/** TextureManager key of the digit glyph sheet the `RetroFont` grid is parsed from. */
const GLYPH_TEXTURE_KEY = `${SCENE_KEY}-glyphs`;
/** BitmapFont cache key the parsed retro font is registered under. */
const GLYPH_FONT_KEY = `${SCENE_KEY}-font`;

/**
 * A pre-selected leaf and its resting grid position - the only nodes `mutate`
 * disturbs. `node` is mutable because the churn archetype replaces it every
 * frame; `parent` and `index` are what the replacement needs to land in the
 * identical place with the identical content.
 */
interface MutableLeaf {
  node: Phaser.GameObjects.Sprite | Phaser.GameObjects.BitmapText;
  readonly parent: Phaser.GameObjects.Container;
  readonly index: number;
  readonly baseX: number;
  readonly baseY: number;
}

/**
 * Register the shared digit sheet as a uniform-grid `RetroFont` in the game's
 * bitmap-font cache, so `BitmapText` can lay text out of a glyph atlas.
 *
 * Idempotent per cell: the game (and its caches) is destroyed and rebuilt for
 * every cell, but `buildScene` may run more than once against one game, and
 * re-adding an existing texture key throws.
 */
const installGlyphFont = (game: Phaser.Game, scene: Phaser.Scene): void => {
  if (!game.textures.exists(GLYPH_TEXTURE_KEY)) {
    game.textures.addCanvas(GLYPH_TEXTURE_KEY, createDigitAtlasCanvas(TEXT_FONT_SIZE));
  }

  if (game.cache.bitmapFont.exists(GLYPH_FONT_KEY)) {
    return;
  }

  // `Parse` returns a complete cache ENTRY (`{ data, texture, frame }`) in
  // Phaser 4, not the bare font data its return type names - verified against the
  // installed 4.2.1 dist, where the parser's tail wraps the glyph table itself.
  // Wrapping it again produces an entry whose `data.chars` is undefined, and
  // `BitmapText` then fails on the first glyph lookup.
  const entry = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: GLYPH_TEXTURE_KEY,
    width: DIGIT_CELL_WIDTH,
    height: DIGIT_CELL_HEIGHT,
    chars: DIGIT_ALPHABET,
    charsPerRow: DIGIT_ALPHABET.length,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 0,
  });

  game.cache.bitmapFont.add(GLYPH_FONT_KEY, entry);
};

export const createPhaserAdapter = (): EngineAdapter => {
  let game: Phaser.Game | null = null;
  let scene: Phaser.Scene | null = null;
  let root: Phaser.GameObjects.Container | null = null;
  let textureKeys: string[] = [];
  let mutableLeaves: MutableLeaf[] = [];
  /** Leaf indices the most recent buildScene selected for mutation - the source of {@link EngineAdapter.mutationSignature}. */
  let mutableIndices: number[] = [];
  /** Rebuilds the leaf at a global index exactly as `buildScene` built it; non-null only for a churning archetype. */
  let rebuildLeaf: ((index: number) => Phaser.GameObjects.Sprite | Phaser.GameObjects.BitmapText) | null = null;
  /** Per-frame mutation mode of the built archetype; see `traits.ts`. */
  let churning = false;
  let textUpdating = false;
  /** Characters per text leaf of the built archetype; `0` when it has no text. */
  let textGlyphs = 0;

  /** The tilemap scene's layer and map, or `null` for every other archetype. */
  let tileLayer: Phaser.Tilemaps.TilemapGPULayer | null = null;
  let tileMap: Phaser.Tilemaps.Tilemap | null = null;
  let tilemapSpec: ArchetypeSpec | null = null;
  let tileExtent: TilemapExtent = { width: 0, height: 0 };

  /**
   * Build the tilemap scene on Phaser's GPU tile layer.
   *
   * The GPU layer is the arm's fastest path for exactly this shape of work - one
   * tileset, one orthographic grid, no per-tile game objects - and it is what a
   * Phaser project would use here, so it is what the comparison measures. It
   * renders the whole layer as a single quad over a data texture, which is why
   * an edit has to be followed by regenerating that texture rather than being
   * picked up on its own.
   */
  const buildTilemapScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const extent = tilemapExtent(nodeCount);
    const key = `${SCENE_KEY}-tiles`;

    if (game!.textures.exists(key)) {
      game!.textures.remove(key);
    }

    game!.textures.addCanvas(key, createTileAtlasCanvas());

    const data: number[][] = [];

    for (let y = 0; y < extent.height; y += 1) {
      const row = new Array<number>(extent.width);

      for (let x = 0; x < extent.width; x += 1) {
        row[x] = tileIdAt(x, y);
      }

      data.push(row);
    }

    const map = scene!.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage('tiles', key, TILE_SIZE, TILE_SIZE, 0, 0)!;
    const layer = map.createLayer(0, tileset, 0, 0, true) as Phaser.Tilemaps.TilemapGPULayer;

    tileMap = map;
    tileLayer = layer;
    tilemapSpec = spec;
    tileExtent = extent;

    const camera = tilemapCameraAt(0, extent);

    scene!.cameras.main.setScroll(camera.x, camera.y);
  };

  /** Drop the tilemap scene so a rebuild (or teardown) leaks nothing. */
  const releaseTilemap = (): void => {
    tileLayer?.destroy();
    tileMap?.destroy();
    tileLayer = null;
    tileMap = null;
    tilemapSpec = null;
  };

  /** The particle scene's emitter, or `null` for every other archetype. */
  let particleEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  let particleSpec: ArchetypeSpec | null = null;
  /** Milliseconds of emitter time already simulated, so `preUpdate` gets a monotonic clock. */
  let particleClockMs = 0;

  /**
   * Build the particle scene on Phaser's own emitter.
   *
   * The draw-only scene emits the whole pool at once and then never steps the
   * emitter: the harness drives rendering alone, so an unstepped emitter holds
   * its particles exactly where they were put - which is the resting simulation
   * this scene asks every arm for. Their positions are overwritten from the
   * shared layout, so this arm draws the identical picture rather than its own
   * random spread.
   *
   * The lifecycle scene keeps Phaser's emitter doing the simulating, configured
   * to the shared contract: a two second life, a steady rate that holds the pool
   * at the node count, a linear drift and a linear fade. Its particles do not
   * land on the same coordinates as the other arms' - the emitter draws its own
   * randoms - and they are not supposed to: the comparison is of equal work, not
   * of identical pixels, and forcing the positions would replace the emitter
   * under test with harness code.
   */
  const buildParticleScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const key = `${SCENE_KEY}-particle`;

    if (game!.textures.exists(key)) {
      game!.textures.remove(key);
    }

    game!.textures.addCanvas(key, createParticleCanvas());

    particleClockMs = 0;

    if (isParticleLifecycle(spec)) {
      const emitter = scene!.add.particles(0, 0, key, {
        lifespan: PARTICLE_LIFETIME * 1000,
        speed: { min: 20, max: 60 },
        angle: { min: 0, max: 360 },
        alpha: { start: PARTICLE_ALPHA, end: 0 },
        // One emission per frame of the share of the pool that expires in it, so
        // the live count holds at the node count instead of oscillating.
        frequency: 0,
        quantity: Math.max(1, Math.round(nodeCount / (PARTICLE_LIFETIME / PARTICLE_STEP))),
        maxAliveParticles: nodeCount,
        // Spread over the viewport through the emitter's own per-particle x/y
        // ranges, so the pool fills the frame the way every other arm's does.
        x: { min: 0, max: VIEWPORT_WIDTH },
        y: { min: 0, max: VIEWPORT_HEIGHT },
      });

      // One full lifetime before the timed window, like every other arm's
      // preroll: the pool reaches its steady state outside the measurement.
      emitter.fastForward(PARTICLE_LIFETIME * 1000, PARTICLE_STEP * 1000);
      particleClockMs = PARTICLE_LIFETIME * 1000;
      particleEmitter = emitter;
    } else {
      const emitter = scene!.add.particles(0, 0, key, {
        lifespan: Number.MAX_SAFE_INTEGER,
        speed: 0,
        alpha: PARTICLE_ALPHA,
        emitting: false,
        maxAliveParticles: nodeCount,
      });

      emitter.explode(nodeCount);

      let index = 0;

      emitter.forEachAlive(particle => {
        const seed = particleSeedAt(index, nodeCount);

        index += 1;
        particle.x = seed.x;
        particle.y = seed.y;
      }, null);

      particleEmitter = emitter;
    }

    particleSpec = spec;
  };

  /** Drop the particle scene so a rebuild (or teardown) leaks nothing. */
  const releaseParticles = (): void => {
    particleEmitter?.destroy();
    particleEmitter = null;
    particleSpec = null;
  };

  /** Hit-test scene state, or nulls for every archetype that resolves no queries. */
  let pickingSpec: ArchetypeSpec | null = null;
  let pickPointer: Phaser.Input.Pointer | null = null;
  let pickHits = 0;

  /**
   * Build the picking scene: interactive rectangles on the shared layout.
   *
   * `setInteractive` is what gives an object the input data Phaser's hit test
   * reads; without it the object is invisible to the query and the row would
   * search an empty list.
   */
  const buildPickingScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const key = `${SCENE_KEY}-pick`;

    if (game!.textures.exists(key)) {
      game!.textures.remove(key);
    }

    game!.textures.addCanvas(key, createParticleCanvas());

    const container = scene!.add.container(0, 0);

    for (let index = 0; index < nodeCount; index += 1) {
      const at = pickRectAt(index);
      const rect = scene!.add.image(at.x, at.y, key).setOrigin(0, 0).setDisplaySize(PICK_RECT_SIZE, PICK_RECT_SIZE);

      rect.setInteractive();
      container.add(rect);
    }

    root = container;
    pickPointer = scene!.input.activePointer;
    pickingSpec = spec;

    // The input plugin moves newly interactive objects out of its pending queue
    // in `preUpdate`, which the stopped game loop never runs - so without this
    // the hit test searches an empty list and reports a very fast nothing.
    // Driven here, at build time, the way the harness already drives the
    // renderer's own phases; it is outside the measured window either way.
    // `preUpdate` runs on the plugin at runtime but is absent from Phaser's
    // published types, which describe the input surface a game uses rather than
    // the phases its loop drives.
    (scene!.input as unknown as { preUpdate(): void }).preUpdate();
  };

  /** Drop the picking scene so a rebuild (or teardown) leaks nothing. */
  const releasePicking = (): void => {
    pickPointer = null;
    pickingSpec = null;
  };

  return {
    engine: 'phaser',
    config: 'webgl2',

    supports(target: Backend): boolean {
      // Phaser 4 ships no WebGPU renderer; the adapter supplies WebGL2 through
      // the public context injection path below.
      return target === 'webgl2';
    },

    coversArchetype(spec: ArchetypeSpec): boolean {
      // This arm builds a fixed, viewport-sized scene with a static camera. A
      // scrolling archetype would silently render as an ordinary fully-visible
      // one here, i.e. a row that looks comparable and is not - so the arm sits
      // the archetype out instead.
      //
      // Render-target archetypes remain out until their Phaser semantics are
      // validated against the shared filter/mask contract.
      return !isScrolling(spec) && !usesRenderTargets(spec);
    },

    async init(canvas: HTMLCanvasElement, target: Backend): Promise<void> {
      if (target !== 'webgl2') {
        throw new Error(`The phaser adapter only runs under the harness 'webgl2' backend request; got '${target}'.`);
      }

      const context = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });

      if (context === null) {
        throw new Error('Phaser requires a WebGL2 context for this arm.');
      }

      await new Promise<void>(resolve => {
        game = new Phaser.Game({
          // Force WebGL and pass the already-created WebGL2 context. Phaser's
          // public type incorrectly calls this CanvasRenderingContext2D, but its
          // WebGLRenderer reads the value as the renderer context at runtime.
          type: Phaser.WEBGL,
          canvas,
          context: context as unknown as CanvasRenderingContext2D,
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          backgroundColor: '#000000',
          // Fixed backing store; never let Phaser's Scale Manager resize the
          // shared harness canvas out from under the fixed 1280x720 viewport.
          scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
          render: { antialias: false, powerPreference: 'high-performance', clearBeforeRender: true, transparent: false, pixelArt: true },
          // Silence / disable every subsystem not under test: the boot banner,
          // audio, and all input listeners. Physics is off by default (no
          // `physics` config). The render loop is halted below.
          banner: false,
          audio: { noAudio: true },
          // Mouse input stays ON although the harness dispatches no events: the
          // input plugin is what registers an interactive object, and with it
          // off the picking archetype's hit test searches an empty list and
          // reports a very fast nothing. The loop is stopped, so no input is
          // processed per frame and no other archetype pays for this.
          input: { keyboard: false, mouse: true, touch: false, gamepad: false },
          disableContextMenu: true,
          autoFocus: false,
          // The scene's `create` fires once the scene reaches RUNNING; resolve
          // init then (the scene ref is fetched by key afterwards).
          scene: { key: SCENE_KEY, create: () => resolve() },
        });
      });

      // Halt Phaser's own requestAnimationFrame loop; the harness drives frames.
      game!.loop.stop();

      if (game!.context !== context) {
        throw new Error('Phaser did not retain the injected WebGL2 context.');
      }

      scene = game!.scene.getScene(SCENE_KEY);
    },

    buildScene(spec: ArchetypeSpec, nodeCount: number, seed: number): void {
      if (game === null || scene === null) {
        throw new Error('buildScene was called before init.');
      }

      releaseTilemap();
      releaseParticles();
      releasePicking();

      if (isParticles(spec)) {
        buildParticleScene(spec, nodeCount);

        return;
      }

      if (isPickingScene(spec)) {
        buildPickingScene(spec, nodeCount);

        return;
      }

      // The tilemap scenes leave the sprite path behind: the leaves are tiles in
      // a layer rather than game objects, so nothing below applies to them.
      if (isTilemap(spec)) {
        buildTilemapScene(spec, nodeCount);

        return;
      }

      const textures = game.textures;

      textureKeys = [];

      for (let t = 0; t < spec.textureCount; t++) {
        const key = `${SCENE_KEY}-tex-${t}`;

        if (textures.exists(key)) {
          textures.remove(key);
        }

        textures.addCanvas(key, createDistinctTextureCanvas(t, spec.textureCount));
        textureKeys.push(key);
      }

      // Nested-container spine of depth `nestingDepth`, exactly as the other arms
      // build it. Phaser Containers propagate their transform matrix down to
      // children every frame, so a deeper archetype pays for deeper transform
      // propagation identically.
      //
      // No culling flag is set: Phaser has no per-node `.cullable` equivalent,
      // and its default `GameObject.willRender` checks only visibility/alpha
      // flags - never a bounds/intersection test - so this arm does no
      // off-screen culling by construction, matching `cullingEnabled: false` on
      // every archetype for cull symmetry.
      const sceneRoot = new Phaser.GameObjects.Container(scene, 0, 0);
      const spine: Phaser.GameObjects.Container[] = [sceneRoot];

      for (let depth = 1; depth < spec.nestingDepth; depth++) {
        const container = new Phaser.GameObjects.Container(scene, 0, 0);

        spine[depth - 1]!.add(container);
        spine.push(container);
      }

      // The SHARED grid, not a transcription of it: this arm places leaf `i` at
      // the position `world.ts` computes, so a change to the layout cannot move
      // one arm's scene without moving every arm's.
      const layout = gridLayout(nodeCount, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GRID_MARGIN);
      const overdraw = hasFullViewportLeaves(spec);
      const alpha = leafAlpha(spec);

      // Shared, canonical mutation selection - the SAME helper every arm routes
      // through, so all arms select the byte-for-byte identical index set and the
      // harness's cross-arm determinism assertion holds.
      const selectedIndices = selectMutationIndices(nodeCount, spec.mutationFraction, seed);
      const selectedSet = new Set(selectedIndices);
      const leaves: MutableLeaf[] = [];

      textGlyphs = isTextArchetype(spec) ? Math.max(1, Math.trunc(spec.textGlyphsPerNode ?? 0)) : 0;
      churning = isChurning(spec);
      textUpdating = isTextUpdating(spec);

      // A text archetype needs a glyph-atlas font. Phaser 4 has no dynamically
      // generated bitmap font, so the shared digit sheet is registered as a
      // uniform-grid `RetroFont` - the atlas text path a Phaser app writes when it
      // has no font asset (see `digitAtlas.ts` for the disclosure this carries).
      if (textGlyphs > 0) {
        installGlyphFont(game, scene);
      }

      /** Resting grid position of leaf `index`, from the shared layout helpers. */
      const leafPosition = (index: number): { x: number; y: number } => (overdraw ? { x: 0, y: 0 } : gridPosition(index, layout, GRID_MARGIN));

      /** Build (but do not parent) the leaf at global index `index`; reused by the churn mutation. */
      const makeLeaf = (index: number): Phaser.GameObjects.Sprite | Phaser.GameObjects.BitmapText => {
        const i = index;
        const { x, y } = leafPosition(i);

        if (textGlyphs > 0) {
          const label = new Phaser.GameObjects.BitmapText(scene!, x, y, GLYPH_FONT_KEY, textForLeaf(i, textGlyphs));

          label.setOrigin(0, 0);

          return label;
        }

        // Texture indexed by position WITHIN the spine bucket, not the global
        // index - identical to the other arms, so the batch-breaking archetype
        // overflows the batcher's texture slots the same way everywhere.
        const key = textureKeys[Math.floor(i / spine.length) % textureKeys.length]!;
        const sprite = new Phaser.GameObjects.Sprite(scene!, 0, 0, key);

        // Top-left anchor to match the other arms (Pixi/ExoJS default anchor is
        // (0,0)); Phaser sprites default to a centred (0.5,0.5) origin, which
        // would place the overdraw quad off-centre and cover only a quarter of
        // the viewport.
        sprite.setOrigin(0, 0);

        // `overdraw` stacks nodeCount full-viewport quads at the origin for
        // genuine fill-bound behaviour; every other archetype lays sprites out on
        // a grid at their native SPRITE_SIZE.
        if (overdraw) {
          sprite.setDisplaySize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        }

        // A fixed leaf alpha is what makes a stack of full-viewport quads a
        // blend workload: every layer has to be composited rather than skipped.
        if (alpha < 1) {
          sprite.setAlpha(alpha);
        }

        sprite.setPosition(x, y);

        return sprite;
      };

      for (let i = 0; i < nodeCount; i++) {
        const leaf = makeLeaf(i);
        const parent = spine[i % spine.length]!;

        parent.add(leaf);

        if (selectedSet.has(i)) {
          const { x, y } = leafPosition(i);

          leaves.push({ node: leaf, parent, index: i, baseX: x, baseY: y });
        }
      }

      rebuildLeaf = churning ? makeLeaf : null;

      // Attach the spine root to the scene display list so it is rendered.
      scene.add.existing(sceneRoot);

      root = sceneRoot;
      mutableLeaves = leaves;
      mutableIndices = selectedIndices;
    },

    pickHits(): number {
      return pickHits;
    },

    mutationSignature(): string {
      return mutationSignature(mutableIndices);
    },

    mutate(frame: number): void {
      // Picking scene: one block of point queries through Phaser's own hit test.
      // The pointer is moved to each point first because the query reads its
      // position, and that move is part of what this arm costs.
      if (pickingSpec !== null && scene !== null && pickPointer !== null) {
        const queries = pointerQueriesPerFrame(pickingSpec);
        let hits = 0;

        for (let index = 0; index < queries; index += 1) {
          const point = pickPointAt(index, queries);

          pickPointer.x = point.x;
          pickPointer.y = point.y;

          // `hitTestPointer` is the plugin's own entry point - it picks the
          // camera and the interactive list itself, which is the path a Phaser
          // project's input actually takes.
          if (scene.input.hitTestPointer(pickPointer).length > 0) {
            hits += 1;
          }
        }

        pickHits = hits;

        return;
      }

      // Particle scenes: the lifecycle one steps Phaser's emitter, which is the
      // simulation under comparison; the draw-only one steps nothing, so its
      // particles stay where the build put them.
      if (particleSpec !== null && particleEmitter !== null) {
        if (isParticleLifecycle(particleSpec)) {
          particleClockMs += PARTICLE_STEP * 1000;
          particleEmitter.preUpdate(particleClockMs, PARTICLE_STEP * 1000);
        }

        return;
      }

      // Tilemap scenes: scroll the camera, then submit this frame's tile changes.
      // The GPU layer reads its tiles from a data texture that does not follow a
      // tile write on its own, so regenerating that texture is what actually
      // submits the edit - and it belongs in the bracket for the same reason the
      // other arms' repacking does.
      if (tilemapSpec !== null && tileLayer !== null && tileMap !== null && scene !== null) {
        const camera = tilemapCameraAt(tilemapCameraFrameFor(tilemapSpec, frame), tileExtent);

        scene.cameras.main.setScroll(camera.x, camera.y);

        if (isTilemapEditing(tilemapSpec)) {
          for (const edit of tilemapEditsAt(frame, tileExtent)) {
            tileMap.putTileAt(edit.tileId, edit.x, edit.y, false, tileLayer as unknown as Phaser.Tilemaps.TilemapLayer);
          }

          tileLayer.generateLayerDataTexture();
        }

        return;
      }

      // Structural churn: destroy each selected leaf and build its replacement in
      // the same place. Phaser's `destroy` removes the object from its parent
      // container itself, so nothing detaches it first.
      if (churning && rebuildLeaf !== null) {
        for (const leaf of mutableLeaves) {
          leaf.node.destroy();

          const replacement = rebuildLeaf(leaf.index);

          leaf.parent.add(replacement);
          leaf.node = replacement;
        }

        return;
      }

      // Text invalidation: re-set the string, discarding that leaf's layout. The
      // frame index shifts the run so no leaf is ever assigned the string it
      // already has.
      if (textUpdating) {
        for (const leaf of mutableLeaves) {
          if (leaf.node instanceof Phaser.GameObjects.BitmapText) {
            leaf.node.setText(textForLeaf(leaf.index + frame, textGlyphs));
          }
        }

        return;
      }

      const { dx, dy } = wobbleOffsetAt(frame);

      for (const leaf of mutableLeaves) {
        leaf.node.setPosition(leaf.baseX + dx, leaf.baseY + dy);
      }
    },

    renderFrame(): void {
      if (game === null || (root === null && tileLayer === null && particleEmitter === null)) {
        throw new Error('renderFrame was called before buildScene.');
      }

      // One explicit frame: exactly the render half of `Game.step` (preRender
      // clears + sets up the frame, SceneManager.render walks the RUNNING scenes
      // through the WebGL renderer, postRender flushes the batch). The
      // update/input/physics half of the step is deliberately never called.
      const renderer = game.renderer;

      renderer.preRender();
      game.scene.render(renderer);
      renderer.postRender();
    },

    teardown(): void {
      releaseTilemap();
      releaseParticles();
      releasePicking();

      if (game !== null) {
        // `destroy` only FLAGS pending destruction (normally consumed by the next
        // game step); since the loop is stopped, drive one explicit `step` - which
        // runs `runDestroy` immediately when `pendingDestroy` is set - so the
        // WebGL context and scene are released now rather than leaking across
        // cells. `removeCanvas: false` keeps the harness-owned canvas in the DOM.
        game.destroy(false);
        game.step(0, 0);
        game = null;
      }

      scene = null;
      root = null;
      textureKeys = [];
      mutableLeaves = [];
      mutableIndices = [];
      rebuildLeaf = null;
      churning = false;
      textUpdating = false;
      textGlyphs = 0;
    },
  };
};
