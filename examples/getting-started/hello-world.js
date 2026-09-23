// Auto-generated from hello-world.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Sprite } from '@codexo/exojs';
// #region guide:first-scene
class HelloWorldScene extends Scene {
  sprite;
  playing = true;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition(width / 2, height / 2);
    this.sprite.interactive = true;
    this.sprite.onPointerTap.add(() => {
      this.playing = !this.playing;
      this.sprite.setTint(this.playing ? Color.white : new Color(150, 170, 190));
    });
    this.root.addChild(this.sprite);
  }
  update(delta) {
    if (this.playing) {
      this.sprite.rotate(delta * 120);
    }
  }
  draw(context) {
    context.render(this.root);
  }
}
// #endregion guide:first-scene
const app = new Application({
  scenes: { HelloWorldScene },
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
await app.start(HelloWorldScene);
