import { Color, Keyboard, Scene, Text } from '@codexo/exojs';
import type { RenderingContext, Time } from '@codexo/exojs';
import { Player } from '../objects/Player';
import { GameOverScene } from './GameOverScene';

export class GameScene extends Scene {
  private _player!: Player;
  private _scoreText!: Text;
  private _elapsed = 0;
  private _move = { up: 0, down: 0, left: 0, right: 0 };

  public override init(): void {
    const { width, height } = this.app!.canvas;

    this._player = new Player();
    this._player.setPosition(width / 2, height / 2);

    this._scoreText = new Text('Score: 0', { fillColor: Color.white, fontSize: 18 });
    this._scoreText.setPosition(16, 16);

    this.addChild(this._player);
    this.addChild(this._scoreText);

    // WASD + arrow keys
    this.inputs.onActive(Keyboard.W, () => { this._move.up = 1; });
    this.inputs.onStop(Keyboard.W, () => { this._move.up = 0; });
    this.inputs.onActive(Keyboard.S, () => { this._move.down = 1; });
    this.inputs.onStop(Keyboard.S, () => { this._move.down = 0; });
    this.inputs.onActive(Keyboard.A, () => { this._move.left = 1; });
    this.inputs.onStop(Keyboard.A, () => { this._move.left = 0; });
    this.inputs.onActive(Keyboard.D, () => { this._move.right = 1; });
    this.inputs.onStop(Keyboard.D, () => { this._move.right = 0; });
    this.inputs.onActive(Keyboard.Up, () => { this._move.up = 1; });
    this.inputs.onStop(Keyboard.Up, () => { this._move.up = 0; });
    this.inputs.onActive(Keyboard.Down, () => { this._move.down = 1; });
    this.inputs.onStop(Keyboard.Down, () => { this._move.down = 0; });
    this.inputs.onActive(Keyboard.Left, () => { this._move.left = 1; });
    this.inputs.onStop(Keyboard.Left, () => { this._move.left = 0; });
    this.inputs.onActive(Keyboard.Right, () => { this._move.right = 1; });
    this.inputs.onStop(Keyboard.Right, () => { this._move.right = 0; });

    this.inputs.onTrigger(Keyboard.Escape, () => {
      void this.app!.scene.setScene(new GameOverScene(Math.floor(this._elapsed)));
    });
  }

  public override update(delta: Time): void {
    const dx = this._move.right - this._move.left;
    const dy = this._move.down - this._move.up;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      const speed = this._player.speed * delta.seconds;
      this._player.move((dx / len) * speed, (dy / len) * speed);
    }

    this._elapsed += delta.seconds;
    this._scoreText.text = `Score: ${Math.floor(this._elapsed)}`;
  }

  public override draw(context: RenderingContext): void {
    context.backend.clear();
    context.render(this.root);
  }
}
