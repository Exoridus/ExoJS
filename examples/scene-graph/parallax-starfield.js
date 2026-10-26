// Auto-generated from parallax-starfield.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Graphics,
  Keyboard,
  Scene,
  Sprite,
  Spritesheet,
  Text,
  VectorAction,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, insetAtlasFrame, startExample, toggle } from '@examples/runtime';
const factors = [0.3, 0.6, 1];
class ParallaxStarfieldScene extends Scene {
  layers = [new Container(), new Container(), new Container()];
  sheets = [];
  actions = new ActionMap({
    move: new VectorAction([{ left: [Keyboard.A, Keyboard.Left], right: [Keyboard.D, Keyboard.Right] }, { x: GamepadAxis.LeftStickX }]),
  });
  factorLabels = ['Clouds x0.3', 'Hills x0.6', 'Ground x1.0'].map(
    text => new Text(text, { fillColor: new Color(24, 47, 56), fontSize: 16 }),
  );
  hero;
  floor;
  panel;
  scroll = 0;
  playing = true;
  drag = null;
  contentHeight = 600;
  onDown = pointer => {
    this.drag ??= { id: pointer.id, x: pointer.x };
  };
  onMove = pointer => {
    if (this.drag?.id !== pointer.id) {
      return;
    }
    if (this.playing) {
      this.scroll += this.drag.x - pointer.x;
    }
    this.drag.x = pointer.x;
  };
  onUp = pointer => {
    if (this.drag?.id === pointer.id) {
      this.drag = null;
    }
  };
  async load() {
    const backgrounds = new Spritesheet(
      await this.loader.load(assets.platformerBackgroundsImage),
      await this.loader.load(assets.platformerBackgroundsAtlas),
    );
    const tiles = new Spritesheet(await this.loader.load(assets.platformerTilesImage), await this.loader.load(assets.platformerTilesAtlas));
    const characters = new Spritesheet(
      await this.loader.load(assets.platformerCharactersImage),
      await this.loader.load(assets.platformerCharactersAtlas),
    );
    this.sheets.push(backgrounds, tiles, characters);
  }
  init() {
    const [backgrounds, tiles, characters] = this.sheets;
    const names = ['background_clouds', 'background_color_hills'];
    for (let layer = 0; layer < 2; layer++) {
      for (let i = -1; i < 6; i++) {
        const frame = insetAtlasFrame(backgrounds.frames.get(names[layer]));
        const crop = layer === 0 ? 80 : 110;
        // Opaque sky rows would otherwise hide the cloud layer behind the hills.
        frame.y += crop;
        frame.height -= crop;
        const sprite = new Sprite(backgrounds.texture).setTextureFrame(frame);
        frame.destroy();
        sprite.width = 512;
        sprite.height = 512;
        sprite.setPosition(i * 512, 0);
        this.layers[layer].addChild(sprite);
      }
    }
    this.floor = new Graphics();
    this.floor.fillColor = new Color(113, 76, 48);
    this.floor.drawRectangle(-256, 0, 2112, 400);
    this.layers[2].addChild(this.floor);
    for (let i = -1; i < 28; i++) {
      const tile = new Sprite(tiles.texture).setTextureFrame(tiles.frames.get('terrain_grass_block_top')).setPosition(i * 64, 0);
      tile.width = 64;
      tile.height = 64;
      this.layers[2].addChild(tile);
      if (i % 4 === 0) {
        this.layers[2].addChild(
          new Sprite(tiles.texture)
            .setTextureFrame(tiles.frames.get(i % 8 === 0 ? 'bush' : 'rock'))
            .setAnchor(0.5, 1)
            .setPosition(i * 64 + 32, 0),
        );
      }
    }
    this.hero = new Sprite(characters.texture).setTextureFrame(characters.frames.get('character_green_idle')).setAnchor(0.5, 1);
    this.inputs.attach(this.actions);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { factors: toggle('Show factors', true) },
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
      },
    });
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
    this.app.input.onPointerCancel.add(this.onUp);
  }
  update(delta) {
    const fit = this.panel.fit(this.app, this.app.canvas);
    this.contentHeight = fit.contentHeight * fit.scale;
    if (this.playing) {
      this.scroll += this.actions.move.value.x * 260 * delta;
    }
    const bottom = this.contentHeight - 45 * fit.scale;
    const tileWidth = [512, 512, 512];
    for (let i = 0; i < 3; i++) {
      const offset = (((this.scroll * factors[i]) % tileWidth[i]) + tileWidth[i]) % tileWidth[i];
      this.layers[i].setPosition(-offset, i === 2 ? bottom : i === 0 ? 0 : bottom - this.contentHeight * 0.4);
      if (i < 2) {
        for (const sprite of this.layers[i].children) {
          sprite.height = this.contentHeight * (i === 0 ? 1 : 0.4);
        }
      }
    }
    this.factorLabels.forEach((label, index) =>
      label
        .setScale(fit.scale)
        .setPosition(16 * fit.scale, index === 0 ? 20 * fit.scale : index === 1 ? bottom - 70 * fit.scale : bottom + 12 * fit.scale),
    );
    this.hero.setPosition(this.app.width / 2, bottom + 4);
    this.hero.setScale(0.6 * fit.scale);
    if (Math.abs(this.actions.move.value.x) > 0.01) {
      this.hero.setScale(Math.sign(this.actions.move.value.x) * 0.6 * fit.scale, 0.6 * fit.scale);
    }
    this.panel.status(
      this.panel.values.factors
        ? `Clouds x0.3 | Hills x0.6 | Ground x1.0 | ${this.playing ? 'Move or drag' : 'Paused'}`
        : this.playing
          ? 'Move or drag to compare depth'
          : 'Paused',
    );
  }
  draw(context) {
    for (const layer of this.layers) {
      context.render(layer);
    }
    context.render(this.hero);
    if (this.panel.values.factors) {
      for (const label of this.factorLabels) {
        context.render(label);
      }
    }
  }
  destroy() {
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onUp);
    this.app.input.onPointerCancel.remove(this.onUp);
    this.panel.dispose();
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.hero.destroy();
    for (const label of this.factorLabels) {
      label.destroy();
    }
    for (const sheet of this.sheets) {
      sheet.destroy();
    }
    super.destroy();
  }
}
const app = new Application({
  scenes: { ParallaxStarfieldScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(191, 224, 248),
});
await startExample(app, () => app.start(ParallaxStarfieldScene));
