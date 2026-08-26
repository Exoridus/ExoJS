import { Container, Graphics, type RenderingContext, Scene, View } from '@codexo/exojs';

interface ParallaxLayer {
  graphics: Graphics;
  speed: number;
}

class MouseParallaxScene extends Scene {
  private _layers: ParallaxLayer[] = [];
  private _pointer = { x: 400, y: 300 };

  // #region guide:mouse-parallax
  override init(): void {
    // Three layers at different depths
    this._layers = [0.15, 0.35, 0.6].map(speed => {
      const g = new Graphics();
      // ... draw layer content ...
      return { graphics: g, speed };
    });

    this._pointer = { x: 400, y: 300 };
    this.app.input.onPointerMove.add(p => {
      this._pointer = { x: p.x, y: p.y };
    });
  }

  override draw(context: RenderingContext): void {
    for (const layer of this._layers) {
      const offsetX = (400 - this._pointer.x) * layer.speed;
      const offsetY = (300 - this._pointer.y) * layer.speed;
      layer.graphics.setPosition(offsetX, offsetY);
      context.render(layer.graphics);
    }
  }
  // #endregion guide:mouse-parallax
}

class ScrollParallaxScene extends Scene {
  private _view = new View(400, 300, 800, 600);
  private _skyLayer = new Container();
  private _hillsLayer = new Container();
  private _worldLayer = new Container();

  // #region guide:scroll-parallax
  override draw(context: RenderingContext): void {
    // Background - moves at 30% of camera speed
    this._skyLayer.setPosition(this._view.center.x * 0.3, 0);
    context.render(this._skyLayer, { view: this._view });

    // Midground - moves at 60%
    this._hillsLayer.setPosition(this._view.center.x * 0.6, 0);
    context.render(this._hillsLayer, { view: this._view });

    // Foreground - moves 1:1 with camera (no parallax)
    context.render(this._worldLayer, { view: this._view });
  }
  // #endregion guide:scroll-parallax
}

export { MouseParallaxScene, ScrollParallaxScene };
