import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  LoadingSceneTransition,
  Scene,
  Sprite,
  Text,
  Texture,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample } from '@examples/runtime';

const sources = [
  assets.spaceShipBlue.source,
  assets.spaceEnemyRed.source,
  assets.spaceBossRed.source,
  assets.spaceMeteorBrown.source,
  assets.spaceMeteorGrey.source,
  assets.spaceLaserBlue.source,
];

class MenuScene extends Scene {
  override init(): void {
    const title = this.track(new Text('Press Space to enter the level', { fillColor: Color.white, fontSize: 40 }));

    title.setAnchor(0.5).setPosition(this.app.width / 2, this.app.height / 2);
    this.root.addChild(title);
    this.inputs.onTrigger(Keyboard.Space, () => {
      void this.app.scenes.change(LevelScene, { transition });
    });
  }
}

class LevelScene extends Scene {
  private textures: Texture[] = [];

  override async load(): Promise<void> {
    this.textures = await this.assets.load(sources.map(source => new Texture(source)));
    // Stands in for level generation: the overlay stays up until this scene is ready.
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  override init(): void {
    this.textures.forEach((texture, index) => {
      this.root.addChild(new Sprite(texture).setAnchor(0.5).setPosition(180 + index * 184, this.app.height / 2));
    });
    this.inputs.onTrigger(Keyboard.Escape, () => {
      void this.app.scenes.change(MenuScene, { transition });
    });
  }
}

// #region guide:loading-overlay
// The transition is created once and reused. Each navigation builds its own overlay and
// destroys it when the new scene is committed, cancelled or failed.
const transition = new LoadingSceneTransition({
  createOverlay: () => {
    const background = new Graphics();
    const bar = new Graphics();
    const label = new Text('Loading', { fillColor: Color.white, fontSize: 28 });

    background.fillColor = new Color(11, 16, 20);
    background.drawRectangle(0, 0, 1, 1);
    bar.fillColor = new Color(136, 233, 126);
    bar.drawRectangle(0, 0, 1, 1);

    return {
      node: new Container().addChild(background, bar, label),
      update(_delta, rendering, progress) {
        const { left, top, width, height } = rendering.screenView.getBounds();
        const length = Math.min(width / 2, 480);
        const fraction = progress === undefined || progress.total === 0 ? 0 : progress.loaded / progress.total;

        background.setPosition(left, top).setScale(width, height);
        bar.setPosition(left + (width - length) / 2, top + height / 2).setScale(length * fraction, 10);
        label.setAnchor(0.5).setPosition(left + width / 2, top + height / 2 - 48);
        label.text = `Loading ${progress?.loaded ?? 0} / ${progress?.total ?? 0}`;
      },
    };
  },
});
// #endregion guide:loading-overlay

const app = new Application({
  scenes: { MenuScene, LevelScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(18, 24, 29),
});

await startExample(app, () => app.start(MenuScene));
