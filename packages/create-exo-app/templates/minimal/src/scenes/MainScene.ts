import { Color, Graphics, Scene } from '@codexo/exojs';
import type { RenderingContext, Time } from '@codexo/exojs';

export class MainScene extends Scene {
  private readonly _box = new Graphics();

  public constructor() {
    super();

    this._box.fillColor = Color.white;
    this._box.drawRectangle(-40, -40, 80, 80);
    this._box.setPosition(400, 300);

    this.addChild(this._box);
  }

  public override update(delta: Time): void {
    this._box.rotate(delta.seconds * 90);
  }

  public override draw(context: RenderingContext): void {
    context.backend.clear();
    context.render(this.root);
  }
}
