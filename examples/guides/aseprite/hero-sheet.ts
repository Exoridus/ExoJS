import { type AnimatedSprite, Scene } from '@codexo/exojs';
import type { AsepriteSheet } from '@codexo/exojs-aseprite';

class HeroScene extends Scene {
  private sheet!: AsepriteSheet;
  private player!: AnimatedSprite;

  // #region guide:aseprite-scene
  override async load(): Promise<void> {
    this.sheet = await this.loader.load({ type: 'asepriteSheet', source: 'sprites/hero.json' });
  }

  override init(): void {
    this.player = this.sheet.createAnimatedSprite();
    this.player.play('walk');
    this.root.addChild(this.player);
  }
  // #endregion guide:aseprite-scene
}

export { HeroScene };
