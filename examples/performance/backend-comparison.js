// Auto-generated from backend-comparison.ts - edit the .ts source, not this file.
import { Application, Capabilities, Color, Container, FixedResolutionCanvasSizing, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
import { mountControls } from '@examples/runtime';
const MAX_SPRITES = 2400;
const COUNT_STEP = 400;
let spriteCount = 800;
let textureCount = 1;
let backendType = 'webgl2';
let webGpuAvailable = false;
let app = null;
let overlay = null;
let booting = false;
const showStartupError = error => {
  const message = document.createElement('p');
  message.textContent = `Could not start the renderer: ${String(error)}`;
  document.body.append(message);
};
const makeTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#19324b';
  ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = '#79d8ff';
  ctx.beginPath();
  ctx.arc(24, 24, 17, 0, Math.PI * 2);
  ctx.fill();
  return new Texture(canvas);
};
class BatchingScene extends Scene {
  layer;
  sprites = [];
  textures = [];
  hud;
  init() {
    this.layer = new Container();
    this.addChild(this.layer);
    this.textures = Array.from({ length: 4 }, () => makeTexture());
    for (let i = 0; i < MAX_SPRITES; i++) {
      const sprite = new Sprite(this.textures[i % textureCount])
        .setAnchor(0.5)
        .setScale(0.42)
        .setPosition((i * 97) % this.app.width, (i * 193) % this.app.height);
      sprite.visible = i < spriteCount;
      this.layer.addChild(sprite);
      this.sprites.push(sprite);
    }
    this.hud = mountControls({
      title: 'Sprite Batching Laboratory',
      corner: 'top-right',
      controls: [
        { keys: 'Up / Down', action: 'change visible sprite count' },
        { keys: 'T', action: 'use one or four textures' },
        { keys: 'B', action: 'switch WebGL2 / WebGPU' },
      ],
      hint: 'The seeded positions and motion stay the same across settings. The overlay reports this workload, not a general backend benchmark.',
    });
    this.updateHud();
    this.inputs.onTrigger(Keyboard.Up, () => this.setCount(Math.min(MAX_SPRITES, spriteCount + COUNT_STEP)));
    this.inputs.onTrigger(Keyboard.Down, () => this.setCount(Math.max(COUNT_STEP, spriteCount - COUNT_STEP)));
    this.inputs.onTrigger(Keyboard.T, () => {
      textureCount = textureCount === 1 ? 4 : 1;
      this.sprites.forEach((sprite, index) => sprite.setTexture(this.textures[index % textureCount]));
      this.updateHud();
    });
    this.inputs.onTrigger(Keyboard.B, () => {
      if (!webGpuAvailable) {
        this.hud.setStatus('WebGPU adapter unavailable; using WebGL2');
        return;
      }
      void boot(backendType === 'webgpu' ? 'webgl2' : 'webgpu').catch(showStartupError);
    });
  }
  setCount(next) {
    spriteCount = next;
    this.sprites.forEach((sprite, index) => {
      sprite.visible = index < spriteCount;
    });
    this.updateHud();
  }
  updateHud() {
    this.hud.setStatus(`${backendType} · ${spriteCount} sprites · ${textureCount} texture${textureCount === 1 ? '' : 's'}`);
  }
  update(_delta) {
    const time = this.app.activeSeconds;
    for (let i = 0; i < spriteCount; i++) {
      const sprite = this.sprites[i];
      sprite.setPosition(((i * 97) % this.app.width) + Math.sin(time + i * 0.13) * 12, ((i * 193) % this.app.height) + Math.cos(time + i * 0.17) * 12);
      sprite.rotation = time * ((i % 2 === 0 ? 1 : -1) * 25);
    }
  }
  draw(context) {
    context.render(this.layer);
  }
  destroy() {
    this.hud.dispose();
    super.destroy();
    this.textures.forEach(texture => texture.destroy());
  }
}
const boot = async type => {
  if (booting) return;
  booting = true;
  try {
    overlay?.destroy();
    overlay = null;
    if (app) {
      const previous = app;
      app = null;
      await previous.destroy();
      previous.element?.remove();
    }
    backendType = type;
    app = new Application({
      scenes: { BatchingScene },
      backend: { type },
      canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
      clearColor: new Color(8, 12, 20),
    });
    overlay = new DebugOverlay(app);
    overlay.layers.performance.visible = true;
    await app.start(BatchingScene);
  } finally {
    booting = false;
  }
};
void Capabilities.ready.then(capabilities => {
  webGpuAvailable = capabilities.webgpuAdapter !== null;
  void boot(webGpuAvailable ? 'webgpu' : 'webgl2').catch(showStartupError);
});
