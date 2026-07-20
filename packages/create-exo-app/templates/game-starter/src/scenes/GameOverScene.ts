import { Color, Keyboard, Scene, Text } from '@codexo/exojs';
import type { RenderingContext } from '@codexo/exojs';
import { GameScene } from './GameScene';

export interface GameOverData {
  readonly score: number;
}

export class GameOverScene extends Scene<GameOverData> {
  private _label!: Text;

  public override init(data: Readonly<GameOverData>): void {
    const { width, height } = this.app!.canvas;

    this._label = new Text(
      `Game Over\nScore: ${data.score}\n\nPress Space to restart`,
      { align: 'center', fillColor: Color.white, fontSize: 26 },
    );
    this._label.setAnchor(0.5);
    this._label.setPosition(width / 2, height / 2);

    this.addChild(this._label);

    this.inputs.onTrigger(Keyboard.Space, () => {
      void this.app!.scenes.setScene(GameScene);
    });
  }

  public override draw(context: RenderingContext): void {
    context.backend.clear(new Color(48, 10, 10));
    context.render(this.root);
  }
}
