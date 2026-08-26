import { Container, type RenderingContext, RetainedContainer, Scene, Sprite, Texture } from '@codexo/exojs';

interface DecorTile {
  x: number;
  y: number;
}

class DecorScene extends Scene {
  private decor = new RetainedContainer();
  private atlas = new Texture();
  private cameraX = 0;
  private cameraY = 0;
  private level: { decorTiles: DecorTile[] } = { decorTiles: [] };
  private enemyInsideGroup = new Container();
  private enemyVoice = new Container();

  // #region guide:retained-layer
  override init(): void {
    this.decor = new RetainedContainer();

    for (const tile of this.level.decorTiles) {
      const sprite = new Sprite(this.atlas);
      sprite.setPosition(tile.x, tile.y);
      this.decor.addChild(sprite);
    }
  }

  override draw(context: RenderingContext): void {
    // Panning the camera over the world is ONE group-matrix update - no
    // descendant transform is recomputed, no child is re-collected.
    this.decor.setPosition(-this.cameraX, -this.cameraY);
    context.render(this.decor);
  }
  // #endregion guide:retained-layer

  // #region guide:group-local-bounds
  override update(): void {
    // getBounds() here is group-local. For a real world position, compose
    // through the boundary:
    const worldMatrix = this.enemyInsideGroup.getWorldTransform();
    this.enemyVoice.setPosition(worldMatrix.x, worldMatrix.y);
  }
  // #endregion guide:group-local-bounds
}

export { DecorScene };
