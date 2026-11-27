// #region guide:parallax-scene
import {
  ActionMap,
  Application,
  AxisAction,
  Color,
  Container,
  Graphics,
  Keyboard,
  Label,
  type Pointer,
  type RenderingContext,
  Scene,
  type Seconds,
  View,
} from '@codexo/exojs';

interface ParallaxLayer {
  graphics: Graphics;
  speed: number;
}

class MouseParallaxScene extends Scene {
  private layers: ParallaxLayer[] = [];
  private readonly pointer = { x: 400, y: 225 };
  private readonly onPointerMove = (pointer: Pointer): void => {
    this.pointer.x = pointer.x;
    this.pointer.y = pointer.y;
  };

  // #region guide:mouse-parallax
  override init(): void {
    this.layers = [0.15, 0.35, 0.6].map((speed, index) => {
      const graphics = new Graphics();

      graphics.fillColor = new Color(70 + index * 40, 130, 190, 0.65);
      graphics.drawCircle(180 + index * 220, 225, 80 - index * 15);
      this.root.addChild(graphics);

      return { graphics, speed };
    });
    this.app.input.onPointerMove.add(this.onPointerMove);
  }

  override update(): void {
    for (const layer of this.layers) {
      layer.graphics.setPosition((this.app.width / 2 - this.pointer.x) * layer.speed, (this.app.height / 2 - this.pointer.y) * layer.speed);
    }
  }

  override destroy(): void {
    this.app.input.onPointerMove.remove(this.onPointerMove);
  }
  // #endregion guide:mouse-parallax
}

class ScrollParallaxScene extends Scene {
  private readonly controls = new ActionMap({ walk: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }) });
  private readonly player = new Container();
  private readonly sky = this.track(new Graphics());
  private readonly hills = this.track(new Graphics());
  private readonly marker = new Graphics();
  private readonly readout = new Label('Click the canvas, then A/D to move. Move the pointer to pick a world point.');
  private camera!: View;
  private initialCenterX = 0;
  private readonly onResize = (): void => {
    this.camera.resize(this.app.width, this.app.height);
    this.camera.setCenter(this.camera.center.x, this.app.height / 2);
  };
  private readonly onPointerMove = (pointer: Pointer): void => {
    // #region guide:parallax-picking
    const world = this.camera.screenToWorld(pointer.x, pointer.y, this.app.width, this.app.height);

    this.marker.setPosition(world.x, world.y);
    this.readout.text = `Canvas (${pointer.x.toFixed(0)}, ${pointer.y.toFixed(0)}) -> world (${world.x.toFixed(0)}, ${world.y.toFixed(0)})`;
    // #endregion guide:parallax-picking
  };

  override init(): void {
    this.initialCenterX = this.app.width / 2;
    this.camera = this.track(new View(this.initialCenterX, this.app.height / 2, this.app.width, this.app.height));
    this.inputs.attach(this.controls);
    this.player.setPosition(400, 310);

    const body = new Graphics();
    const floor = new Graphics();

    body.fillColor = new Color(255, 213, 112);
    body.drawRectangle(-20, -40, 40, 80);
    this.player.addChild(body);
    floor.fillColor = new Color(65, 95, 100);
    floor.drawRectangle(-500, 350, 3000, 100);
    this.marker.fillColor = new Color(255, 120, 110);
    this.marker.drawCircle(0, 0, 5);
    this.root.addChild(floor, this.player, this.marker);
    this.sky.fillColor = new Color(135, 175, 205);
    this.hills.fillColor = new Color(55, 105, 130);

    for (let x = -500; x < 2500; x += 260) {
      this.sky.drawCircle(x, 95, 48);
      this.hills.drawCircle(x + 80, 360, 140);
    }

    this.readout.anchorIn(this.ui, 'top-left', 24, 20);
    this.ui.addChild(this.readout);
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.onResize.add(this.onResize);
  }

  override update(delta: Seconds): void {
    this.player.x = Math.max(100, Math.min(1500, this.player.x + this.controls.walk.value * 240 * delta));
    // The Container has origin (0,0); its world origin is the desired camera target.
    const target = this.player.getWorldTransform();
    const weight = 1 - Math.exp(-5 * delta);

    this.camera.setCenter(this.camera.center.x + (target.x - this.camera.center.x) * weight, this.app.height / 2);
  }

  // #region guide:scroll-parallax
  override draw(context: RenderingContext): void {
    const travel = this.camera.center.x - this.initialCenterX;

    // Both layers use the same camera. Compensate the part of its travel
    // that this layer should not inherit on screen: factor 0.3 means 30%.
    this.sky.setPosition((1 - 0.3) * travel, 0);
    this.hills.setPosition((1 - 0.6) * travel, 0);
    context.render(this.sky, { view: this.camera });
    context.render(this.hills, { view: this.camera });
    context.render(this.root, { view: this.camera });
  }
  // #endregion guide:scroll-parallax

  override destroy(): void {
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.onResize.remove(this.onResize);
  }
}

const app = new Application({
  scenes: { ScrollParallaxScene, MouseParallaxScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(ScrollParallaxScene);
// #endregion guide:parallax-scene

export { MouseParallaxScene, ScrollParallaxScene };
