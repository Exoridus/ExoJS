import { Quadtree, Rectangle, Scene, Sprite } from '@codexo/exojs';

// The game's own hit reaction: the guide shows which pairs reach it, not what
// it does with them.
declare const resolveCollision: (a: Sprite, b: Sprite) => void;

class QuadtreeScene extends Scene {
  private enemies: Sprite[] = [];
  private player!: Sprite;

  private resolveHits(): void {
    const { player } = this;

    // #region guide:quadtree
    const tree = new Quadtree<Sprite>(new Rectangle(0, 0, 800, 600), 8, 5);

    // Insert objects each frame
    for (const enemy of this.enemies) {
      tree.insert({ bounds: enemy.getBounds(), payload: enemy });
    }

    // Query nearby objects
    const nearby = tree.queryRect(player.getBounds());
    for (const item of nearby) {
      if (player.intersectsWith(item.payload)) {
        resolveCollision(player, item.payload);
      }
    }
    // #endregion guide:quadtree
  }
}

export { QuadtreeScene };
