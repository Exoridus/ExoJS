// Auto-generated from backend-comparison.ts - edit the .ts source, not this file.
import { Application, Capabilities, Color, FixedResolutionCanvasSizing, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
const options = {
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
};
let app = null;
let overlay = null;
let backendType = 'webgl2';
let webGpuAvailable = false;
class DemoScene extends Scene {
  sprites;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprites = Array.from({ length: 2200 }, () => {
      const sprite = new Sprite(this.loader.get('image/ship-a.png'));
      sprite.setAnchor(0.5);
      sprite.setScale(0.35);
      sprite.setPosition(Math.random() * width, Math.random() * height);
      return {
        sprite,
        vx: (Math.random() - 0.5) * 180,
        vy: (Math.random() - 0.5) * 180,
      };
    });
    this.inputs.onTrigger(Keyboard.B, () => {
      // Without an adapter the WebGPU backend produces no context and the
      // canvas stays blank, so the comparison only toggles where both
      // backends can actually run.
      if (!webGpuAvailable) return;
      backendType = backendType === 'webgpu' ? 'webgl2' : 'webgpu';
      boot(backendType);
    });
  }
  update(delta) {
    const app = this.app;
    const { width, height } = app;
    for (const item of this.sprites) {
      item.sprite.move(item.vx * delta, item.vy * delta);
      if (item.sprite.position.x < 0 || item.sprite.position.x > width) item.vx *= -1;
      if (item.sprite.position.y < 0 || item.sprite.position.y > height) item.vy *= -1;
    }
  }
  draw(context) {
    for (const { sprite } of this.sprites) context.render(sprite);
  }
}
const boot = type => {
  if (overlay !== null) {
    overlay.destroy();
    overlay = null;
  }
  if (app !== null) {
    void app.destroy();
    app.element?.remove();
    app = null;
  }
  app = new Application({ ...options, scenes: { DemoScene }, backend: { type } });
  overlay = new DebugOverlay(app);
  overlay.layers.performance.visible = true;
  void app.start(DemoScene);
};
// The adapter query is async, so the first boot waits for it: starting on
// WebGPU where no adapter exists leaves the canvas blank with no error.
// `webgpu` only reports the API surface - a browser can expose `navigator.gpu`
// and still hand out no adapter, so the adapter itself is the deciding fact.
void Capabilities.ready.then(capabilities => {
  webGpuAvailable = capabilities.webgpuAdapter !== null;
  backendType = webGpuAvailable ? 'webgpu' : 'webgl2';
  boot(backendType);
});
