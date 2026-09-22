// #region guide:minimal-scene
import type { RenderingContext, Seconds } from '@codexo/exojs';
import { Color, Graphics, Scene } from '@codexo/exojs';

export class MainScene extends Scene {
  private readonly _box = new Graphics();

  public constructor() {
    super();

    this._box.fillColor = Color.white;
    this._box.drawRectangle(-40, -40, 80, 80);
    this._box.setPosition(400, 300);

    this.addChild(this._box);
  }

  public override update(delta: Seconds): void {
    this._box.rotate(delta * 90);
  }

  public override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}
// #endregion guide:minimal-scene
