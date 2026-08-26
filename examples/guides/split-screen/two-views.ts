import { Color, GamepadAxis, Graphics, type RenderingContext, Scene, type Seconds, Sprite, View } from '@codexo/exojs';

interface PlayerInput {
  move: { x: number; y: number };
}

class SplitScreenScene extends Scene {
  private _leftView!: View;
  private _rightView!: View;
  private _divider!: Graphics;
  private _leftPlayer!: Sprite;
  private _rightPlayer!: Sprite;
  private _player1: PlayerInput = { move: { x: 0, y: 0 } };
  private _player2: PlayerInput = { move: { x: 0, y: 0 } };

  // #region guide:two-views
  override init(): void {
    const { width, height } = this.app;

    // Left player view - left half of screen
    this._leftView = new View(0, 0, width / 2, height);
    this._leftView.viewport.set(0, 0, 0.5, 1);

    // Right player view - right half of screen
    this._rightView = new View(0, 0, width / 2, height);
    this._rightView.viewport.set(0.5, 0, 0.5, 1);

    // White divider line between views
    this._divider = new Graphics();
    this._divider.fillColor = Color.white;
    this._divider.drawRectangle(width / 2 - 1, 0, 2, height);

    // Shared world objects - both views see these
    this._leftPlayer = new Sprite(this.loader.get('image/hero.png')).setAnchor(0.5).setTint(new Color(120, 190, 255));
    this._rightPlayer = new Sprite(this.loader.get('image/hero.png')).setAnchor(0.5).setTint(new Color(255, 180, 120));
  }

  override update(delta: Seconds): void {
    // Move players independently - WASD drives one, the arrows the other.
    this._leftPlayer.move(this._player1.move.x * 260 * delta, this._player1.move.y * 260 * delta);
    this._rightPlayer.move(this._player2.move.x * 260 * delta, this._player2.move.y * 260 * delta);

    // Each view follows its player
    this._leftView.setCenter(this._leftPlayer.position.x, this._leftPlayer.position.y);
    this._rightView.setCenter(this._rightPlayer.position.x, this._rightPlayer.position.y);
  }

  override draw(context: RenderingContext): void {
    // Render left view
    context.render(this._leftPlayer, { view: this._leftView });
    context.render(this._rightPlayer, { view: this._leftView });
    // ... world objects ...

    // Render right view
    context.render(this._leftPlayer, { view: this._rightView });
    context.render(this._rightPlayer, { view: this._rightView });
    // ... same world objects ...

    // Divider renders in default camera space
    context.render(this._divider);
  }
  // #endregion guide:two-views

  private bindPads(): void {
    // #region guide:one-pad-each
    const pad0 = this.app.input.getGamepad(0);
    pad0.onActive(GamepadAxis.LeftStickX, v => {
      this._player1.move.x = v;
    });

    const pad1 = this.app.input.getGamepad(1);
    pad1.onActive(GamepadAxis.LeftStickX, v => {
      this._player2.move.x = v;
    });
    // #endregion guide:one-pad-each
  }
}

export { SplitScreenScene };
