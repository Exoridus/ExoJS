// Auto-generated from pointer-and-hittest.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';
const NAMES = ['red', 'green', 'blue'];
class PointerAndHittestScene extends Scene {
  sprites;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprites = [];
    for (let i = 0; i < 3; i++) {
      const sprite = new Sprite(this.loader.get(assets.ship))
        .setAnchor(0.5)
        .setScale(2.4)
        .setPosition(width / 2 - 45 + i * 45, height / 2);
      sprite.zIndex = i;
      sprite.interactive = true;
      sprite.draggable = true;
      sprite.setTint([new Color(255, 130, 130), new Color(130, 255, 170), new Color(140, 190, 255)][i]);
      // A press lands on the topmost interactive node under the pointer; the
      // Output panel names which one the hit test picked.
      sprite.onPointerTap.add(event => console.log(`Hit: ship ${i + 1} (${NAMES[i]}) at ${Math.round(event.x)}, ${Math.round(event.y)}`));
      sprite.onDragEnd.add(() => console.log(`Dropped ship ${i + 1} (${NAMES[i]}) at ${Math.round(sprite.x)}, ${Math.round(sprite.y)}`));
      // The hitTest layer (and the interaction system itself) walk the
      // scene graph, so interactive nodes must live under scene.root.
      this.root.addChild(sprite);
      this.sprites.push(sprite);
    }
    this.hud = mountControls({ title: 'Interaction Inspector', status: 'Front: 3 (blue)' });
    this.inputs.onTrigger(Keyboard.One, () => this.setFront(0));
    this.inputs.onTrigger(Keyboard.Two, () => this.setFront(1));
    this.inputs.onTrigger(Keyboard.Three, () => this.setFront(2));
  }
  setFront(index) {
    this.sprites.forEach((sprite, i) => {
      sprite.zIndex = i === index ? 3 : i;
    });
    this.hud.setStatus(`Front: ${index + 1} (${NAMES[index]})`);
    console.info(`Front: ship ${index + 1} (${NAMES[index]})`);
  }
  destroy() {
    this.hud.dispose();
    super.destroy();
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
});
const debug = new DebugOverlay(app);
debug.layers.boundingBoxes.visible = true;
debug.layers.hitTest.visible = true;
debug.layers.pointerStack.visible = true;
await app.start(PointerAndHittestScene);
