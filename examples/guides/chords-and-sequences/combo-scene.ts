import { ActionMap, ChordAction, Scene, SequenceAction } from '@codexo/exojs';

// #region guide:chords-and-sequences
class GameScene extends Scene {
  // Your own game objects - anything exposing these methods.
  declare game: { save(): void };
  declare player: { specialAttack(): void };

  controls = new ActionMap({
    save: new ChordAction('Control+S'),
    special: new SequenceAction('Down>Down+Right>Right>A', {
      maxGap: 250,
      timeout: 1_200,
    }),
  });

  override init(): void {
    this.inputs.attach(this.controls);
  }

  override update(): void {
    if (this.controls.save.pressed) {
      this.game.save();
    }

    if (this.controls.special.triggered) {
      this.player.specialAttack();
    }
  }
}
// #endregion guide:chords-and-sequences

export { GameScene };
