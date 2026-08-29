import * as Phaser from 'phaser';

import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import { createDigitAtlasCanvas, DIGIT_ALPHABET, DIGIT_CELL_HEIGHT, DIGIT_CELL_WIDTH } from '../digitAtlas';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';
import { isChurning, isTextArchetype, isTextUpdating, textForLeaf, usesRenderTargets } from '../traits';
import { isScrolling } from '../world';

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
 * WEBGL VERSION DISCLOSURE - EMPIRICAL, and the reason this arm is measured as it
 * is. Phaser 4 "Caladan" is often described as a from-scratch WebGL2 renderer;
 * against the installed 4.2.1 source it is NOT. Its `WebGLRenderer.init` requests
 * a `'webgl'` (WebGL**1**) context by default (`canvas.getContext('webgl')`,
 * `WebGLRenderer.js:709`), its shaders are GLSL ES 1.00 (`attribute`/`varying`;
 * no `#version 300 es` anywhere in the dist), and it polyfills the WebGL2-core
 * features it needs (instanced arrays, VAO) from WebGL1 extensions - its renderer
 * is an evolution of the Phaser 3.85+ WebGL path, not a WebGL2 rewrite.
 *
 * By deliberate decision this arm renders through Phaser's OWN default context
 * (WebGL, i.e. WebGL1) - exactly as a stock Phaser 4 app would - rather than
 * injecting a WebGL2 context to force backend parity. That keeps the arm honest:
 * its CPU-time column is measured identically to the other arms and IS cross-arm
 * comparable, but its GPU/structural columns are NOT WebGL2-backend-comparable.
 * The harness's WebGL2 draw-call structural probe cannot attach to a WebGL
 * (WebGL1) context, so this arm reports NO structural counters - disclosed per
 * cell by the harness (`page/harness.ts::attachProbes`) and in the report
 * Methodology; the counts are omitted, never faked. Phaser 4 ships NO WebGPU
 * renderer (`Phaser.AUTO/CANVAS/WEBGL/HEADLESS` only), so this arm supports the
 * `'webgl2'` backend request only and never runs `'webgpu'`.
 *
 * The harness owns frame cadence, so Phaser's own `requestAnimationFrame` game
 * loop (`TimeStep`) is halted right after boot (`game.loop.stop()`), and one
 * frame is produced by the exact render sequence `Game.step` runs -
 * `renderer.preRender()`, `scene.render(renderer)`, `renderer.postRender()` -
 * with the update/input/physics half of the step deliberately never called, so
 * only Phaser's render path is measured.
 */

/** Fixed design-space viewport the harness canvas renders (see `page/index.html`). Identical to the ExoJS/Pixi arms. */
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
/** Inset that keeps every gridded sprite (plus its mutation wobble) inside the view so culling never removes it mid-run. */
const GRID_MARGIN = 32;
/** Side length of the generated per-archetype textures / sprites, in pixels. */
const SPRITE_SIZE = 8;
/** Peak per-axis displacement applied to a mutated leaf; small enough to never cross the viewport edge. */
const WOBBLE_AMPLITUDE = 2;
/** Phase step per frame for the mutation wobble. */
const WOBBLE_SPEED = 0.15;
/** TextureManager key of the scene the game boots (fixed; the game is destroyed and rebuilt per cell). */
const SCENE_KEY = 'bench';
/** Font size, in logical pixels, of every text leaf - identical on every arm. */
const TEXT_FONT_SIZE = 12;
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
 * Generate one of `total` visually distinct solid-colour 8x8 canvases - the same
 * construction the ExoJS/Pixi arms use, so the `batch-breaking` archetype breaks
 * batches on every arm for the same reason (distinct GPU texture identities).
 */
const createTextureCanvas = (index: number, total: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('A 2D context is required to generate benchmark textures.');
  }

  const hue = total > 1 ? Math.round((index / total) * 360) : 210;

  context.fillStyle = `hsl(${hue}, 70%, 55%)`;
  context.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  return canvas;
};

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

  return {
    engine: 'phaser',
    config: 'default',

    supports(target: Backend): boolean {
      // Phaser 4 renders WebGL (WebGL1) via its default context and ships no
      // WebGPU renderer; it runs under the harness 'webgl2' request (disclosed)
      // and never the 'webgpu' backend.
      return target === 'webgl2';
    },

    coversArchetype(spec: ArchetypeSpec): boolean {
      // This arm builds a fixed, viewport-sized scene with a static camera. A
      // scrolling archetype would silently render as an ordinary fully-visible
      // one here, i.e. a row that looks comparable and is not - so the arm sits
      // the archetype out instead.
      //
      // The render-target archetypes are sat out for the reason this arm's header
      // comment establishes empirically: Phaser 4 renders a WebGL1 context, so a
      // filter- or mask-heavy row's gap would be attributable to the backend
      // generation rather than to the engine.
      return !isScrolling(spec) && !usesRenderTargets(spec);
    },

    async init(canvas: HTMLCanvasElement, target: Backend): Promise<void> {
      if (target !== 'webgl2') {
        throw new Error(`The phaser adapter only runs under the harness 'webgl2' backend request (Phaser 4 renders WebGL1); got '${target}'.`);
      }

      await new Promise<void>(resolve => {
        game = new Phaser.Game({
          // Force WebGL (never AUTO/Canvas): a Canvas fallback would silently
          // measure a different renderer. Phaser 4's WebGLRenderer creates its
          // own default `'webgl'` (WebGL1) context - no `context` is injected, so
          // this measures a stock Phaser 4 app's renderer honestly.
          type: Phaser.WEBGL,
          canvas,
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          backgroundColor: '#000000',
          // Fixed backing store; never let Phaser's Scale manager resize the
          // shared harness canvas out from under the fixed 1280x720 viewport.
          scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
          render: { antialias: false, powerPreference: 'high-performance', clearBeforeRender: true, transparent: false, pixelArt: true },
          // Silence / disable every subsystem not under test: the boot banner,
          // audio, and all input listeners. Physics is off by default (no
          // `physics` config). The render loop is halted below.
          banner: false,
          audio: { noAudio: true },
          input: { keyboard: false, mouse: false, touch: false, gamepad: false },
          disableContextMenu: true,
          autoFocus: false,
          // The scene's `create` fires once the scene reaches RUNNING; resolve
          // init then (the scene ref is fetched by key afterwards).
          scene: { key: SCENE_KEY, create: () => resolve() },
        });
      });

      // Halt Phaser's own requestAnimationFrame loop; the harness drives frames.
      game!.loop.stop();
      scene = game!.scene.getScene(SCENE_KEY);
    },

    buildScene(spec: ArchetypeSpec, nodeCount: number, seed: number): void {
      if (game === null || scene === null) {
        throw new Error('buildScene was called before init.');
      }

      const textures = game.textures;

      textureKeys = [];

      for (let t = 0; t < spec.textureCount; t++) {
        const key = `${SCENE_KEY}-tex-${t}`;

        if (textures.exists(key)) {
          textures.remove(key);
        }

        textures.addCanvas(key, createTextureCanvas(t, spec.textureCount));
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

      const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
      const rows = Math.max(1, Math.ceil(nodeCount / columns));
      const cellWidth = (VIEWPORT_WIDTH - 2 * GRID_MARGIN) / columns;
      const cellHeight = (VIEWPORT_HEIGHT - 2 * GRID_MARGIN) / rows;
      const overdraw = spec.id === 'overdraw';

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

      /** Resting grid position of leaf `index`, on this arm's transcription of the shared grid. */
      const leafPosition = (index: number): { x: number; y: number } =>
        overdraw
          ? { x: 0, y: 0 }
          : {
              x: GRID_MARGIN + (index % columns) * cellWidth + cellWidth / 2,
              y: GRID_MARGIN + Math.floor(index / columns) * cellHeight + cellHeight / 2,
            };

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

    mutationSignature(): string {
      return mutationSignature(mutableIndices);
    },

    mutate(frame: number): void {
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

      const phase = frame * WOBBLE_SPEED;
      const dx = Math.sin(phase) * WOBBLE_AMPLITUDE;
      const dy = Math.cos(phase) * WOBBLE_AMPLITUDE;

      for (const leaf of mutableLeaves) {
        leaf.node.setPosition(leaf.baseX + dx, leaf.baseY + dy);
      }
    },

    renderFrame(): void {
      if (game === null || root === null) {
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
