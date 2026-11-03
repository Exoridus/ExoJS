// Auto-generated from pixel-vfx-gallery.ts - edit the .ts source, not this file.
import {
  Application,
  Button,
  Color,
  Graphics,
  Label,
  Panel,
  PixelSnapMode,
  ResponsiveCanvasSizing,
  ScaleModes,
  Scene,
  ScrollContainer,
  Vector,
} from '@codexo/exojs';
import {
  AlphaFadeOverLifetime,
  ApplyForce,
  BurstSpawn,
  ColorGradient,
  ColorOverLifetime,
  ConeDirection,
  Constant,
  Curve,
  Drag,
  particlesExtension,
  ParticleSystem,
  Range,
  RateSpawn,
  ScaleOverLifetime,
  VectorRange,
} from '@codexo/exojs/particles';
import { AsepriteSheet } from '@codexo/exojs-aseprite';
import { pixelVfxAssets as assets } from '@codexo/exojs-demo-assets/pixel-vfx';
import { demoPanel, siteUITheme, startExample, toggle } from '@examples/runtime';
const EFFECTS = [
  { title: 'Mechanical sparks', image: assets.mechanicalSparksImage, atlas: assets.mechanicalSparksAtlas },
  { title: 'Ground dust', image: assets.groundDustImage, atlas: assets.groundDustAtlas },
  { title: 'Impact burst', image: assets.impactBurstImage, atlas: assets.impactBurstAtlas },
  { title: 'Workshop smoke', image: assets.workshopSmokeImage, atlas: assets.workshopSmokeAtlas },
  { title: 'Relic activation', image: assets.relicActivationImage, atlas: assets.relicActivationAtlas },
  { title: 'Energy discharge', image: assets.energyDischargeImage, atlas: assets.energyDischargeAtlas },
];
const controls = {
  playing: toggle('Play previews', true),
  loop: toggle('Loop one-shots', true),
  live: toggle('Live particles', true),
};
const ink = new Color(234, 240, 244);
const muted = new Color(165, 181, 192);
const surface = new Color(25, 34, 42);
const checkerDark = new Color(29, 41, 50);
const checkerLight = new Color(41, 55, 64);
const cardHeight = 244;
class PixelVfxGalleryScene extends Scene {
  effects = [];
  cards = [];
  scroll = new ScrollContainer({ width: 1, height: 1, scrollbarThickness: 12 });
  heading = new Label('Pixel VFX gallery', { fontSize: 20, fontWeight: 'bold', fillColor: ink });
  hint = new Label('Native pixels and 2x. Next frame pauses previews.', { fontSize: 12, fillColor: muted });
  livePanels = [];
  sparks;
  smoke;
  panel;
  layoutWidth = 0;
  layoutHeight = 0;
  async load() {
    this.effects = await Promise.all(
      EFFECTS.map(async effect => {
        const [texture, atlas] = await Promise.all([this.loader.load(effect.image), this.loader.load(effect.atlas)]);
        texture.setScaleMode(ScaleModes.Nearest).setGenerateMipMap(false);
        // Explicit image and JSON descriptors stay paired when a bundler hashes their URLs.
        const sheet = this.track(AsepriteSheet.parse(atlas, texture));
        const clip = sheet.clips.get('play');
        return { title: effect.title, sheet, size: clip.frames[0].width, durations: clip.frameDurations, loop: clip.repeat === -1 };
      }),
    );
  }
  init() {
    this.ui.theme = siteUITheme();
    this.ui.addChild(this.heading, this.hint, this.scroll);
    for (const effect of this.effects) {
      const card = this.createCard(effect);
      this.cards.push(card);
      this.scroll.content.addChild(card.panel);
    }
    this.createLiveParticles();
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: { 'Replay all': () => this.cards.forEach(card => this.replay(card)) },
      onChange: (key, _value, values) => {
        if (key === 'live') {
          for (const system of [this.sparks, this.smoke]) {
            if (values.live) {
              this.systems.add(system);
            } else {
              this.systems.remove(system);
            }
          }
          return;
        }
        for (const card of this.cards) {
          for (const sprite of card.sprites) {
            if (key === 'loop') {
              sprite.play('play', { repeat: values.loop || card.effect.loop ? -1 : 1 });
            }
            if (values.playing) {
              sprite.resume();
            } else {
              sprite.pause();
            }
          }
        }
      },
    });
  }
  createCard(effect) {
    const panel = new Panel({ color: surface, borderWidth: 0, cornerRadius: 0 });
    const title = new Label(effect.title, { fontSize: 15, fontWeight: 'bold', fillColor: ink }).setPosition(12, 10);
    const status = new Label('', { fontSize: 12, fillColor: muted }).setPosition(12, 30);
    const grid = new Graphics();
    const sprites = [1, 2].map(scale => {
      const sprite = effect.sheet.createAnimatedSprite().play('play', { repeat: -1 }).setAnchor(0.5).setScale(scale);
      sprite.pixelSnapMode = PixelSnapMode.Position;
      return sprite;
    });
    const labels = [1, 2].map(scale => new Label(`${scale}x`, { fontSize: 12, fillColor: muted }));
    const replay = new Button({ label: 'Replay', width: 80, height: 30, fontSize: 13 }).setPosition(12, 204);
    const next = new Button({ label: 'Next frame', width: 104, height: 30, fontSize: 13 }).setPosition(100, 204);
    const card = { effect, panel, grid, sprites, labels, status };
    replay.onClick.add(() => this.replay(card));
    next.onClick.add(() => this.nextFrame(card));
    panel.addChild(grid, title, status, ...sprites, ...labels, replay, next);
    return card;
  }
  replay(card) {
    for (const sprite of card.sprites) {
      sprite.play('play', { repeat: this.panel.values.loop || card.effect.loop ? -1 : 1 });
      if (!this.panel.values.playing) {
        sprite.pause();
      }
    }
  }
  nextFrame(card) {
    const next = (card.sprites[0].currentFrame + 1) % card.effect.durations.length;
    const time = card.effect.durations.slice(0, next).reduce((sum, duration) => sum + duration, 0);
    this.panel.set('playing', false);
    // Only an explicit step advances manually; attached sprites otherwise use AnimationSystem.
    for (const sprite of card.sprites) {
      sprite
        .play('play', { repeat: this.panel.values.loop || card.effect.loop ? -1 : 1 })
        .update(time)
        .pause();
    }
  }
  createLiveParticles() {
    this.sparks = new ParticleSystem({ capacity: 128, simulation: 'cpu' });
    this.sparks.addSpawnModule(
      new BurstSpawn({
        schedule: [{ time: 0, count: 18 }],
        interval: 1.1,
        lifetime: new Range(0.4, 0.8),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 2, 45, 95),
        scale: new Constant(new Vector(2, 2)),
      }),
    );
    this.sparks.addUpdateModule(new ApplyForce(0, 120));
    this.sparks.addUpdateModule(new Drag(0.15));
    this.sparks.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 241, 173) },
          { t: 0.45, color: new Color(232, 157, 66) },
          { t: 1, color: new Color(117, 67, 36, 0) },
        ]),
      ),
    );
    const smokeSheet = this.effects[3].sheet.spritesheet;
    this.smoke = new ParticleSystem(smokeSheet.texture, [smokeSheet.getFrame('8')], { capacity: 64, simulation: 'cpu' });
    this.smoke.addSpawnModule(
      new RateSpawn({
        rate: new Constant(6),
        lifetime: new Range(1.6, 2.4),
        position: new VectorRange(-4, 4, -2, 2),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 12, 25, 35),
      }),
    );
    this.smoke.addUpdateModule(new ApplyForce(5, -3));
    this.smoke.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.65 },
          { t: 1, v: 1.5 },
        ]),
      ),
    );
    this.smoke.addUpdateModule(
      new AlphaFadeOverLifetime(
        new Curve([
          { t: 0, v: 0 },
          { t: 0.15, v: 0.8 },
          { t: 0.7, v: 0.6 },
          { t: 1, v: 0 },
        ]),
      ),
    );
    for (const [index, system] of [this.sparks, this.smoke].entries()) {
      const panel = new Panel({ color: surface, borderWidth: 0, cornerRadius: 0 });
      const title = new Label(index === 0 ? 'Live sparks' : 'Live workshop smoke', { fontSize: 15, fontWeight: 'bold', fillColor: ink });
      const detail = new Label(index === 0 ? 'BurstSpawn, force and drag' : 'Atlas frame, RateSpawn and lifetime curves', {
        fontSize: 12,
        fillColor: muted,
      });
      title.setPosition(12, 10);
      detail.setPosition(12, 31);
      panel.addChild(title, detail, system);
      this.livePanels.push(panel);
      this.scroll.content.addChild(panel);
    }
  }
  update() {
    const view = this.panel.fit(this.app, this.app.canvas);
    const scale = view.scale / this.ui.uiScale;
    this.heading.setPosition(12 * scale, 10 * scale).setScale(scale);
    this.hint.setPosition(12 * scale, 35 * scale).setScale(scale);
    this.scroll
      .setPosition(0, 58 * scale)
      .setScale(scale)
      .setSize(view.width, Math.max(1, view.contentHeight - 64));
    if (this.layoutWidth !== view.width || this.layoutHeight !== view.contentHeight) {
      this.layoutWidth = view.width;
      this.layoutHeight = view.contentHeight;
      this.layoutCards(view.width);
    }
    for (const card of this.cards) {
      const frame = card.sprites[0].currentFrame;
      const duration = Math.round(card.effect.durations[frame] * 1000);
      card.status.text = `${card.effect.size} x ${card.effect.size} | frame ${frame + 1}/${card.effect.durations.length} | ${duration} ms`;
    }
    this.panel.status(`Nearest sampling | ${this.sparks.aliveCount} live sparks | ${this.smoke.aliveCount} smoke particles`);
  }
  layoutCards(width) {
    const gap = 12;
    const available = Math.max(260, width - 36);
    const columns = Math.min(3, Math.max(1, Math.floor((available + gap) / 280)));
    const cellWidth = Math.floor((available - (columns - 1) * gap) / columns);
    for (const [index, card] of this.cards.entries()) {
      card.panel.setPosition(12 + (index % columns) * (cellWidth + gap), Math.floor(index / columns) * (cardHeight + gap));
      card.panel.setSize(cellWidth, cardHeight);
      card.grid.clear();
      for (const [preview, sprite] of card.sprites.entries()) {
        const size = card.effect.size * (preview + 1);
        const centerX = Math.floor(cellWidth * (preview === 0 ? 0.25 : 0.7));
        const left = centerX - size / 2;
        const top = 112 - size / 2;
        for (let y = 0; y < size; y += 8) {
          for (let x = 0; x < size; x += 8) {
            card.grid.fillColor = (x / 8 + y / 8) % 2 === 0 ? checkerDark : checkerLight;
            card.grid.drawRectangle(left + x, top + y, 8, 8);
          }
        }
        sprite.setPosition(centerX, 112);
        const label = card.labels[preview];
        label.setPosition(centerX - label.uiWidth / 2, 182);
      }
    }
    const liveTop = Math.ceil(this.cards.length / columns) * (cardHeight + gap);
    const liveColumns = width >= 620 ? 2 : 1;
    const liveWidth = Math.floor((available - (liveColumns - 1) * gap) / liveColumns);
    for (const [index, panel] of this.livePanels.entries()) {
      panel.setPosition(12 + (index % liveColumns) * (liveWidth + gap), liveTop + Math.floor(index / liveColumns) * 192);
      panel.setSize(liveWidth, 180);
    }
    this.sparks.setPosition(Math.floor(liveWidth / 2), 140);
    this.smoke.setPosition(Math.floor(liveWidth / 2), 142);
    this.scroll.refresh();
  }
  destroy() {
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { PixelVfxGalleryScene },
  canvas: {
    width: 1280,
    height: 800,
    mount: document.body,
    sizing: new ResponsiveCanvasSizing({ minAspect: 0.5 }),
    pixelRatio: 1,
    imageRendering: 'pixelated',
  },
  clearColor: new Color(17, 24, 30),
  extensions: [particlesExtension],
});
await startExample(app, () => app.start(PixelVfxGalleryScene));
