import { Color, Graphics } from '@codexo/exojs';

export class Player extends Graphics {
  public readonly speed = 280;

  public constructor() {
    super();
    // Circle drawn at local origin so the node position is the visual center
    this.fillColor = new Color(0xff6347);
    this.drawCircle(0, 0, 20);
  }
}
