import { Pointer, Scene, Sprite } from '@codexo/exojs';

interface PointerPosition {
  x: number;
  y: number;
}

class PointerStateScene extends Scene {
  private isPointing = false;
  private pointers = new Map<number, PointerPosition>();
  private sprite!: Sprite;

  private bindPointerState(): void {
    // #region guide:pointer-active
    this.inputs.onActive(Pointer.Active, () => {
      this.isPointing = true;
    });
    this.inputs.onStop(Pointer.Active, () => {
      this.isPointing = false;
    });
    // #endregion guide:pointer-active
  }

  // #region guide:multi-touch
  override init(): void {
    this.pointers = new Map();

    this.app.input.onPointerDown.add(p => {
      this.pointers.set(p.id, { x: p.x, y: p.y });
    });

    this.app.input.onPointerMove.add(p => {
      if (this.pointers.has(p.id)) {
        this.pointers.set(p.id, { x: p.x, y: p.y });
      }
    });

    this.app.input.onPointerUp.add(p => {
      this.pointers.delete(p.id);
    });

    this.app.input.onPointerCancel.add(p => {
      this.pointers.delete(p.id);
    });
  }
  // #endregion guide:multi-touch

  private buildDraggable(): void {
    // #region guide:draggable-sprite
    this.sprite = new Sprite(this.loader.get('image/hero.png'));
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition(400, 300);

    this.sprite.interactive = true; // respond to pointer events
    this.sprite.draggable = true; // enable drag behavior
    // #endregion guide:draggable-sprite
  }
}

// #region guide:pointer-slots
class TouchScene extends Scene {
  private touchX = 0;

  override init(): void {
    // Slot 1 (second finger)
    this.inputs.onActive(Pointer.Slot1X, value => {
      this.touchX = value * this.app.width;
    });
  }
}
// #endregion guide:pointer-slots

export { PointerStateScene, TouchScene };
