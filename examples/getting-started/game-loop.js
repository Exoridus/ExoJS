// Auto-generated from game-loop.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Sprite } from '@codexo/exojs';
class GameLoopScene extends Scene {
  sprite;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition(width / 2, height / 2);
  }
  update(delta) {
    this.sprite.rotate(delta.seconds * 120);
  }
  draw(context) {
    context.render(this.sprite);
  }
}
const app = new Application({
  scenes: { GameLoopScene },
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
app.start(GameLoopScene);
