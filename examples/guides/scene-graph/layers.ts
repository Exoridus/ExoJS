import { Container, Scene, Sprite } from '@codexo/exojs';

class WorldScene extends Scene {
  private hero!: Sprite;
  private coin!: Sprite;
  private world = new Container();
  private hud = new Container();
  private player = new Container();
  private background = new Container();
  private foreground = new Container();

  // #region guide:add-children
  override init(): void {
    this.hero = new Sprite(this.loader.get('hero.png'));
    this.coin = new Sprite(this.loader.get('coin.png'));

    this.addChild(this.hero);
    this.addChild(this.coin);
  }
  // #endregion guide:add-children

  // #region guide:layers
  private buildLayers(): void {
    this.world = new Container();
    this.hud = new Container();

    this.world.addChild(new Sprite(this.loader.get('level.png')));
    this.hud.addChild(new Sprite(this.loader.get('health-bar.png')));

    this.addChild(this.world);
    this.addChild(this.hud);
  }
  // #endregion guide:layers

  private buildPlayer(): void {
    // #region guide:nested-nodes
    this.player = new Container();
    this.player.setPosition(100, 0);

    const body = new Sprite(this.loader.get('body.png'));
    const head = new Sprite(this.loader.get('head.png'));
    head.setPosition(0, -32);

    this.player.addChild(body);
    this.player.addChild(head);
    this.addChild(this.player);
    // #endregion guide:nested-nodes
  }

  private orderLayers(): void {
    // #region guide:draw-order
    this.world.addChild(this.background);
    this.world.addChild(this.player); // drawn over background
    this.world.addChild(this.foreground); // drawn over player
    // #endregion guide:draw-order
  }
}

export { WorldScene };
