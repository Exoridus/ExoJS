// Auto-generated from pointer-and-hittest.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
import { mountControls } from '@examples/runtime';
class PointerAndHittestScene extends Scene {
  sprites;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprites = [];
    for (let i = 0; i < 3; i++) {
      const sprite = new Sprite(this.loader.get('image/ship-a.png'))
        .setAnchor(0.5)
        .setScale(2.4)
        .setPosition(width / 2 - 45 + i * 45, height / 2);
      sprite.zIndex = i;
      sprite.interactive = true;
      sprite.draggable = true;
      sprite.setTint([new Color(255, 130, 130), new Color(130, 255, 170), new Color(140, 190, 255)][i]);
      // The hitTest layer (and the interaction system itself) walk the
      // scene graph, so interactive nodes must live under scene.root.
      this.root.addChild(sprite);
      this.sprites.push(sprite);
    }
    this.hud = mountControls({
      title: 'Interaction Inspector',
      controls: [
        { keys: 'Drag', action: 'move an overlapping sprite' },
        { keys: '1 / 2 / 3', action: 'bring that sprite to the front' },
      ],
      status: 'Front: 3 (blue)',
      hint: 'The overlays show pointer targets, hit tests, and scene-graph bounds.',
    });
    this.inputs.onTrigger(Keyboard.One, () => this.setFront(0));
    this.inputs.onTrigger(Keyboard.Two, () => this.setFront(1));
    this.inputs.onTrigger(Keyboard.Three, () => this.setFront(2));
  }
  setFront(index) {
    this.sprites.forEach((sprite, i) => {
      sprite.zIndex = i === index ? 3 : i;
    });
    this.hud.setStatus(`Front: ${index + 1} (${['red', 'green', 'blue'][index]})`);
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
debug.layers.boundingBoxes.visible = true;
debug.layers.hitTest.visible = true;
debug.layers.pointerStack.visible = true;
await app.start(PointerAndHittestScene);
