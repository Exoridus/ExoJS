// Auto-generated from retained-container.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, RetainedContainer, Scene, Sprite, Spritesheet } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle } from '@examples/runtime';
// A decor field far larger than the viewport: thousands of sprites that are
// authored ONCE and never mutated again - the exact shape the retained tier is
// built for. Only the group as a whole ever moves (the "camera" pan below).
const FIELD_COLUMNS = 96;
const FIELD_ROWS = 60;
const TILE_SPACING = 34;
const FIELD_COUNT = FIELD_COLUMNS * FIELD_ROWS;
class RetainedContainerScene extends Scene {
  sheet;
  // Typed as the base Container so the same field code works whether the
  // active group is a RetainedContainer or a plain Container.
  field;
  retained = true;
  elapsed = 0;
  // Exponential moving average of the wall-clock frame time, so the readout
  // is legible instead of flickering frame to frame.
  smoothedFrameMs = 0;
  panel;
  async load() {
    this.sheet = new Spritesheet(await this.loader.load(assets.platformerTilesImage), await this.loader.load(assets.platformerTilesAtlas));
  }
  init() {
    this.field = this.buildField(this.retained);
    this.panel = demoPanel({
      scene: this,
      controls: { retained: toggle('Retained tier', this.retained) },
      onChange: (_key, retained) => {
        if (retained === this.retained) {
          return;
        }
        this.retained = retained;
        // Rebuild the field into the other container type. Destroying the
        // OLD group is safe: it owns no child that outlives it, so the
        // whole subtree is torn down together (see the in-place-destroy
        // footgun in the guide).
        this.field.destroy();
        this.field = this.buildField(this.retained);
      },
    });
    this.systems.add({
      postFrame: () => {
        const stats = this.app.backend.stats;
        // CPU frame cost includes submission, not asynchronous GPU time or an isolated collection benchmark.
        this.smoothedFrameMs += (stats.frameTimeMs - this.smoothedFrameMs) * 0.1;
        this.panel.status(
          `${FIELD_COUNT} sprites, ${stats.submittedNodes} nodes submitted, ${this.smoothedFrameMs.toFixed(2)} ms CPU frame`,
        );
      },
    });
  }
  update(delta) {
    this.elapsed += delta;
  }
  draw(context) {
    const app = this.app;
    const { width, height } = app;
    // Pan the whole field along a slow Lissajous path, like a camera drifting
    // over a static world. For a RetainedContainer this is ONE group-matrix
    // update per frame - the retained fragment is untouched, so no descendant
    // transform is recomputed and no child is re-collected. A plain Container
    // still walks all FIELD_COUNT children every frame to place them.
    const panX = width / 2 + Math.cos(this.elapsed * 0.35) * 140;
    const panY = height / 2 + Math.sin(this.elapsed * 0.5) * 90;
    this.field.setPosition(panX, panY);
    context.render(this.field);
  }
  /**
   * Build the decor field into a fresh container of the requested tier.
   * Both branches produce an identical scene; only the container type differs,
   * which is the whole point of the comparison.
   */
  buildField(retained) {
    // The ONLY line that opts into the retained tier. There is no runtime
    // toggle on the instance itself - the tier is chosen at construction.
    const group = retained ? new RetainedContainer() : new Container();
    const frames = ['terrain_grass_block', 'terrain_sand_block', 'terrain_stone_block', 'terrain_snow_block'].map(name =>
      this.sheet.getFrame(name),
    );
    const palette = [Color.white, new Color(0x87ceeb), new Color(0xffd700), new Color(0x00fa9a), new Color(0xff69b4), new Color(0x9370db)];
    let index = 0;
    for (let row = 0; row < FIELD_ROWS; row++) {
      for (let column = 0; column < FIELD_COLUMNS; column++) {
        const sprite = new Sprite(this.sheet.texture);
        // Deterministic layout, centered on the group origin so panning the
        // group reveals the field drifting as one rigid sheet.
        sprite.setTextureFrame(frames[index % frames.length]);
        sprite.setAnchor(0.5);
        sprite.setPosition((column - (FIELD_COLUMNS - 1) / 2) * TILE_SPACING, (row - (FIELD_ROWS - 1) / 2) * TILE_SPACING);
        sprite.setScale(0.42);
        sprite.setTint(palette[index % palette.length]);
        // Authored once, never mutated again: no per-frame setter runs on a
        // child, so the retained fragment stays clean and is spliced whole.
        group.addChild(sprite);
        index++;
      }
    }
    return group;
  }
  destroy() {
    this.panel?.dispose();
    this.field?.destroy();
    this.sheet?.clear();
    super.destroy();
  }
}
const app = new Application({
  scenes: { RetainedContainerScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(6, 9, 18, 1),
});
await startExample(app, () => app.start(RetainedContainerScene));
