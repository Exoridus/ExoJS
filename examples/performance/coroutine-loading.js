// Auto-generated from coroutine-loading.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Text, Time } from '@codexo/exojs';
const TILE_COUNT = 9000;
const TILE_SIZE = 12;
const COLUMNS = 120;
/**
 * Time-slicing body. Curried, so the call site stays free of wrapper lambdas,
 * and the inner generator receives the frame budget. It places as many tiles
 * as fit in the slice, yields its completion fraction as progress, and comes
 * back for more next frame.
 */
const buildWorld = (tiles, layer) =>
  function* (budget) {
    let placed = 0;
    while (placed < tiles.length) {
      // `do`/`while` rather than `while`: the slice is guaranteed to be
      // positive at the first step, so one tile always lands even on a frame
      // that has already missed its target.
      do {
        const tile = tiles[placed++];
        const quad = new Graphics();
        quad.fillColor = Color.fromCss(`hsl(${tile.hue % 360} 55% 50%)`);
        quad.drawRectangle(tile.x, tile.y, TILE_SIZE - 1, TILE_SIZE - 1);
        layer.addChild(quad);
      } while (placed < tiles.length && budget.timeRemaining() > 0);
      yield placed / tiles.length;
    }
    return placed;
  };
/**
 * Sequencing body. It never looks at the budget, so one `yield` is one frame -
 * which is what makes the caret blink at a readable rate rather than as fast
 * as the loop can run.
 */
function* blinkCaret(caret) {
  while (true) {
    for (let frame = 0; frame < 30; frame++) yield;
    caret.visible = !caret.visible;
  }
}
class CoroutineLoadingScene extends Scene {
  world;
  bar;
  caret;
  label;
  build = null;
  init() {
    const { width, height } = this.app;
    this.world = new Container();
    this.world.setPosition((width - COLUMNS * TILE_SIZE) / 2, 140);
    this.bar = new Graphics();
    this.caret = new Graphics();
    this.caret.fillColor = new Color(120, 220, 255);
    this.caret.drawRectangle(0, 0, 10, 20);
    this.caret.setPosition(width / 2 - 5, height - 60);
    this.label = new Text('', { align: 'center', fillColor: Color.white, fontSize: 20 });
    this.label.setAnchor(0.5).setPosition(width / 2, 70);
    // Two coroutines, two modes, one queue. The blink is queued above the
    // build so it keeps its cadence while the build fills whatever is left.
    this.coroutines.queue(blinkCaret(this.caret), { name: 'caret', priority: 1 });
    this.start();
    this.inputs.onTrigger(Keyboard.C, () => {
      this.build?.cancel();
    });
    this.inputs.onTrigger(Keyboard.R, () => {
      this.start();
    });
  }
  draw(context) {
    const { width } = this.app;
    const progress = this.build?.progress ?? 0;
    this.label.text = `${this.statusLine()}   ·   C cancels, R restarts   ·   coroutine spend ${this.app.coroutines.lastFrameMs.toFixed(2)} ms/frame`;
    this.bar.clear();
    this.bar.fillColor = new Color(255, 255, 255, 0.12);
    this.bar.drawRectangle(width / 2 - 300, 100, 600, 14);
    this.bar.fillColor = new Color(120, 220, 255);
    this.bar.drawRectangle(width / 2 - 300, 100, 600 * progress, 14);
    context.render(this.world);
    context.render(this.bar);
    context.render(this.caret);
    context.render(this.label);
  }
  start() {
    this.build?.cancel();
    this.world.removeChildren();
    const tiles = Array.from({ length: TILE_COUNT }, (_unused, index) => ({
      x: (index % COLUMNS) * TILE_SIZE,
      y: Math.floor(index / COLUMNS) * TILE_SIZE,
      hue: (index % COLUMNS) * 3 + Math.floor(index / COLUMNS) * 7,
    }));
    this.build = this.coroutines.queue(buildWorld(tiles, this.world), { name: 'world' });
  }
  statusLine() {
    const build = this.build;
    if (build === null) return 'idle';
    switch (build.status) {
      case 'done':
        return `built ${build.result ?? 0} tiles`;
      case 'cancelled':
        return 'cancelled';
      case 'failed':
        return `failed: ${build.error?.message ?? 'unknown'}`;
      default:
        return `building ${Math.round((build.progress ?? 0) * 100)}%`;
    }
  }
}
const app = new Application({
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(14, 16, 24),
});
// A quarter of whatever each frame has left, never more than 3 ms. The share
// is what keeps a frame that is already behind from being handed more work;
// `max` bounds how long post-flush work may delay the next frame request.
app.coroutines.budget = { share: 0.25, max: Time.seconds(0.003) };
await app.start(CoroutineLoadingScene);
