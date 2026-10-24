import { Application, Color, FixedResolutionCanvasSizing, Graphics, type Pointer, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const MAX_TOUCHES = 10;

// Ten distinct hues so up to ten simultaneous fingers each get their own colour.
const colors = [
  new Color(255, 100, 100),
  new Color(255, 170, 90),
  new Color(255, 230, 120),
  new Color(170, 255, 120),
  new Color(100, 255, 160),
  new Color(100, 230, 255),
  new Color(120, 170, 255),
  new Color(170, 130, 255),
  new Color(230, 120, 255),
  new Color(255, 130, 200),
];

interface Touch {
  id: number;
  x: number;
  y: number;
}

class MultitouchScene extends Scene {
  private graphics!: Graphics;
  private labels: Text[] = [];
  private pointers = new Map<number, Touch>();
  private readonly gestureShape = new Graphics();
  private gestureScale = 1;
  private gestureDegrees = 0;
  private focal = { x: 640, y: 360 };
  private cancelled = 0;
  private readonly onDown = (pointer: Pointer): void => {
    if (this.pointers.size >= MAX_TOUCHES || this.pointers.has(pointer.id)) {
      return;
    }

    this.pointers.set(pointer.id, { id: pointer.id, x: pointer.x, y: pointer.y });
    this.refreshHud();
  };
  private readonly onMove = (pointer: Pointer): void => {
    const touch = this.pointers.get(pointer.id);

    if (touch) {
      touch.x = pointer.x;
      touch.y = pointer.y;
    }
  };
  private readonly onUp = (pointer: Pointer): void => {
    this.pointers.delete(pointer.id);
    this.refreshHud();
  };
  private readonly onCancel = (pointer: Pointer): void => {
    this.cancelled++;
    this.onUp(pointer);
  };
  // #region gesture-transform
  private readonly onPinch = (scale: number, x: number, y: number): void => {
    this.gestureScale = Math.max(0.25, Math.min(3, this.gestureScale * scale));
    this.focal = { x, y };
  };
  private readonly onRotate = (angleDelta: number, x: number, y: number): void => {
    this.gestureDegrees -= (angleDelta * 180) / Math.PI;
    this.focal = { x, y };
  };
  // #endregion gesture-transform
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const app = this.app;
    this.graphics = new Graphics();

    // Reusable label pool - one Text per possible touch, repositioned each frame.
    for (let i = 0; i < MAX_TOUCHES; i++) {
      this.labels.push(new Text('', { fillColor: Color.white, fontSize: 16 }).setAnchor(0.5));
    }

    this.gestureShape.fillColor = new Color(151, 226, 60, 0.7);
    this.gestureShape.drawPolygon([0, -65, 45, 35, -30, 35]);
    this.gestureShape.fillColor = Color.white;
    this.gestureShape.drawCircle(0, -40, 7);
    app.input.onPointerDown.add(this.onDown);
    app.input.onPointerMove.add(this.onMove);
    app.input.onPointerUp.add(this.onUp);
    app.input.onPointerCancel.add(this.onCancel);
    app.input.onPinch.add(this.onPinch);
    app.input.onRotate.add(this.onRotate);

    this.hud = mountControls({
      theme: 'site',
      title: 'Multitouch gestures',
      hint: 'Use two contacts to pinch / rotate. Mouse shows one pointer. Hardware touch remains a separate check.',
    });
  }

  private refreshHud(): void {
    this.hud?.setStatus(
      `IDs ${[...this.pointers.keys()].join(', ') || 'none'} | Scale ${this.gestureScale.toFixed(2)} | Rotation ${this.gestureDegrees.toFixed(0)} deg | Cancelled ${this.cancelled}`,
    );
  }

  override update(): void {
    const fit = this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.gestureShape
      .setPosition(this.focal.x, Math.min(this.focal.y, fit.contentHeight * fit.scale - 70))
      .setScale(this.gestureScale * fit.scale)
      .setRotation(this.gestureDegrees);

    for (const label of this.labels) {
      label.setScale(fit.scale);
    }

    this.refreshHud();
  }

  override draw(context: RenderingContext): void {
    context.render(this.gestureShape);
    this.graphics.clear();

    let index = 0;

    for (const touch of this.pointers.values()) {
      const color = colors[index % colors.length];

      this.graphics.fillColor = color;
      this.graphics.drawCircle(touch.x, touch.y, 28);

      const label = this.labels[index];

      label.text = `${index + 1}·#${touch.id}`;
      label.setPosition(touch.x, touch.y);

      index++;
    }

    context.render(this.graphics);

    // Draw the index/id labels on top of their circles.
    for (let i = 0; i < this.pointers.size; i++) {
      context.render(this.labels[i]);
    }
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onUp);
    this.app.input.onPointerCancel.remove(this.onCancel);
    this.app.input.onPinch.remove(this.onPinch);
    this.app.input.onRotate.remove(this.onRotate);
    this.pointers.clear();
    this.hud.dispose();
    this.graphics.destroy();
    this.gestureShape.destroy();

    for (const label of this.labels) {
      label.destroy();
    }

    super.destroy();
  }
}

const app = new Application({
  scenes: { MultitouchScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
});

await app.start(MultitouchScene);
