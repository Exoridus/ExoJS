// Auto-generated from pixelfx-transitions.ts - edit the .ts source, not this file.
import {
  Application,
  Asset,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Rectangle,
  ScaleModes,
  Scene,
  SceneTransition,
  Sprite,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample } from '@examples/runtime';
class AtlasSession {
  manifest;
  effect;
  environment;
  placement = 'screen';
  sprite;
  frame = new Rectangle();
  phase = 'closing';
  elapsed = 0;
  index = 0;
  constructor(manifest, effect, texture, environment) {
    this.manifest = manifest;
    this.effect = effect;
    this.environment = environment;
    this.sprite = new Sprite(texture);
  }
  get done() {
    return this.phase === 'done';
  }
  update(delta) {
    if (this.phase === 'done') {
      return;
    }
    if (this.phase === 'covering') {
      this.phase = 'holding';
      this.environment.commit();
      return;
    }
    if (this.phase === 'holding') {
      if (!this.environment.committed) {
        return;
      }
      this.phase = 'opening';
      this.index = this.effect.coverEnd;
      this.elapsed = 0;
      return;
    }
    this.elapsed += Math.max(0, delta);
    if (this.phase === 'closing') {
      this.index = Math.min(this.effect.coverEnd, Math.floor(this.elapsed * this.manifest.fps));
      if (this.index === this.effect.coverEnd) {
        this.phase = 'covering';
      }
    } else {
      this.index = Math.min(this.effect.frameCount - 1, this.effect.coverEnd + Math.floor(this.elapsed * this.manifest.fps));
      if (this.index === this.effect.frameCount - 1) {
        this.phase = 'done';
      }
    }
  }
  render(context) {
    const { width, height } = this.manifest;
    this.frame.set((this.index % this.effect.columns) * width, Math.floor(this.index / this.effect.columns) * height, width, height);
    this.sprite.setTextureFrame(this.frame);
    const bounds = context.screenView.getBounds();
    const scale = Math.max((bounds.right - bounds.left) / width, (bounds.bottom - bounds.top) / height);
    this.sprite.setPosition((bounds.left + bounds.right - width * scale) / 2, (bounds.top + bounds.bottom - height * scale) / 2);
    this.sprite.setScale(scale);
    context.render(this.sprite, { view: context.screenView });
  }
  destroy() {
    this.sprite.destroy();
    this.frame.destroy();
  }
}
class AtlasTransition extends SceneTransition {
  manifest;
  effect;
  texture;
  constructor(manifest, effect, texture) {
    super();
    this.manifest = manifest;
    this.effect = effect;
    this.texture = texture;
  }
  getRequirements() {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }
  createSession(environment) {
    return new AtlasSession(this.manifest, this.effect, this.texture, environment);
  }
}
let selected = 0;
let playing = false;
let transitions = [];
let manifest;
class DemoScene extends Scene {
  night = false;
  init() {
    const background = this.track(new Graphics());
    background.fillColor = this.night ? new Color(28, 18, 64) : new Color(21, 110, 139);
    background.drawRectangle(0, 0, 1280, 720);
    background.fillColor = this.night ? new Color(235, 150, 90) : new Color(252, 220, 115);
    background.drawCircle(940, 190, 95);
    background.fillColor = this.night ? new Color(75, 45, 105) : new Color(25, 75, 95);
    background.drawPolygon([0, 620, 260, 300, 470, 570, 720, 340, 1040, 620, 1280, 400, 1280, 720, 0, 720]);
    background.interactive = true;
    background.onPointerTap.add(() => this.play());
    const title = this.track(
      new Text(this.night ? 'NIGHT OBSERVATORY' : 'DAYTIME HARBOR', { fillColor: Color.white, fontSize: 56, fontWeight: 'bold' }),
    );
    title.setPosition(70, 80);
    this.root.addChild(background, title);
    const panel = demoPanel({
      scene: this,
      title: 'PixelFX transitions',
      controls: {},
      actions: {
        '1 Burn Away': () => select(0),
        '2 Pixel Dissolve': () => select(1),
        '3 Star Iris': () => select(2),
        'Replay / Space': () => this.play(),
      },
    });
    const select = index => {
      this.select(index);
      panel.status(`Selected: ${manifest.effects[selected].label}`);
    };
    this.inputs.onTrigger(Keyboard.One, () => select(0));
    this.inputs.onTrigger(Keyboard.Two, () => select(1));
    this.inputs.onTrigger(Keyboard.Three, () => select(2));
    this.inputs.onTrigger(Keyboard.Space, () => this.play());
    panel.status(`Selected: ${manifest.effects[selected].label}`);
  }
  select(index) {
    if (!playing) {
      selected = index;
    }
  }
  play() {
    if (playing) {
      return;
    }
    playing = true;
    void this.app.scenes
      .change(this.night ? DayScene : NightScene, { transition: transitions[selected] })
      .catch(error => {
        console.error('Scene transition failed:', error);
      })
      .finally(() => {
        playing = false;
      });
  }
  draw(context) {
    context.render(this.root);
  }
}
class DayScene extends DemoScene {}
class NightScene extends DemoScene {
  night = true;
}
const app = new Application({
  scenes: { DayScene, NightScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await startExample(app, async () => {
  manifest = await app.loader.load(assets.pixelfxTransitionsManifest);
  const textures = await Promise.all(
    [assets.pixelfxBurnAway, assets.pixelfxPixelDissolve, assets.pixelfxStarIris].map(atlas =>
      app.loader.load(Asset.type('texture', atlas.source, { textureOptions: { scaleMode: ScaleModes.Nearest, generateMipMap: false } })),
    ),
  );
  transitions = manifest.effects.map((effect, index) => new AtlasTransition(manifest, effect, textures[index]));
  await app.start(DayScene);
});
