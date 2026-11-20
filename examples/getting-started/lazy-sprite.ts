import { Application, Color, FixedResolutionCanvasSizing, Scene, type Seconds, Sprite, Text, type Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample } from '@examples/runtime';

// #region guide:lazy-sprite-scene
class LazySpriteScene extends Scene {
  private readonly ship = new Sprite(assets.ship.source);
  private readonly enemy = new Sprite(assets.spaceEnemyRed.source);
  private readonly missing = new Sprite('images/does-not-exist.png');
  private readonly status = this.track(new Text('', { fillColor: Color.white, fontSize: 22 }));

  override init(): void {
    const { width, height } = this.app;

    this.ship
      .setAnchor(0.5)
      .setScale(2)
      .setPosition(width * 0.25, height / 2);
    this.enemy
      .setAnchor(0.5)
      .setScale(2)
      .setPosition(width * 0.5, height / 2);
    this.missing.setAnchor(0.5).setPosition(width * 0.75, height / 2);
    this.status.setPosition(48, 48);

    this.root.addChild(this.ship, this.enemy, this.missing, this.status);
  }

  override update(delta: Seconds): void {
    this.ship.rotate(delta * 90);
    this.enemy.rotate(-delta * 60);

    const describe = (name: string, sprite: Sprite): string => {
      const texture = sprite.texture as Texture;

      return `${name}: ${texture.loadState}${texture.ready ? ` ${texture.width}x${texture.height}` : ''}`;
    };

    this.status.text = [describe('ship', this.ship), describe('enemy', this.enemy), describe('missing', this.missing)].join('\n');
  }
}
// #endregion guide:lazy-sprite-scene

const app = new Application({
  scenes: { LazySpriteScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(18, 24, 29),
});

await startExample(app, () => app.start(LazySpriteScene));
