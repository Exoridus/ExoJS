// Auto-generated from pointer-and-hittest.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
class PointerAndHittestScene extends Scene {
  sprites;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprites = [];
    for (let i = 0; i < 5; i++) {
      const sprite = new Sprite(this.loader.get('image/ship-a.png'))
        .setAnchor(0.5)
        .setScale(1.2)
        .setPosition(width / 2 - 120 + i * 60, height / 2 - 20 + (i % 2) * 40);
      sprite.zIndex = i;
      sprite.interactive = true;
      sprite.draggable = true;
      sprite.setTint([new Color(255, 130, 130), new Color(130, 255, 170), new Color(140, 190, 255), new Color(255, 230, 130), new Color(220, 140, 255)][i]);
      // The hitTest layer (and the interaction manager itself) walk the
      // scene graph, so interactive nodes must live under scene.root.
      this.root.addChild(sprite);
      this.sprites.push(sprite);
    }
  }
  draw(context) {
    context.render(this.root);
  }
}
const app = new Application({
  scenes: { PointerAndHittestScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});
const debug = new DebugOverlay(app);
debug.layers.hitTest.visible = true;
debug.layers.pointerStack.visible = true;
await app.start(PointerAndHittestScene);
