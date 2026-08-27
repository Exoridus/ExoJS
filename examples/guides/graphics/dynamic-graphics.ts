import { Color, Graphics, Scene, type Seconds } from '@codexo/exojs';

class BarChartScene extends Scene {
  private g = new Graphics();
  private values: number[] = [];

  // #region guide:redraw-per-frame
  override update(delta: Seconds): void {
    this.g.clear();

    this.g.fillColor = new Color(0xff6347);
    for (let i = 0; i < this.values.length; i++) {
      const h = this.values[i] * 200;
      this.g.drawRectangle(i * 30, -h, 26, h);
    }
  }
  // #endregion guide:redraw-per-frame
}

class GroupedShapesScene extends Scene {
  private group = new Graphics();

  // #region guide:shape-group
  override init(): void {
    this.group = new Graphics();
    this.group.fillColor = new Color(0xdaa520);
    this.group.drawCircle(-40, 0, 20);
    this.group.drawCircle(40, 0, 20);
    this.group.drawRectangle(-10, -15, 20, 30);

    this.group.setPosition(this.app.width / 2, this.app.height / 2);
    this.addChild(this.group);
  }

  override update(delta: Seconds): void {
    this.group.rotate(60 * delta);
  }
  // #endregion guide:shape-group
}

export { BarChartScene, GroupedShapesScene };
