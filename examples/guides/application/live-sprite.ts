import { Application, Scene, Sprite } from '@codexo/exojs';
import { demoAssets } from '@codexo/exojs-demo-assets';

class MainScene extends Scene {
  public override init(): void {
    this.addChild(new Sprite(demoAssets.ship.source).setPosition(32, 32));
  }
}

const app = new Application({ scenes: { MainScene } });
await app.start(MainScene);
