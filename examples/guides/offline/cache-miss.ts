import { AssetCacheMissError, Assets, Scene } from '@codexo/exojs';

const assets = Assets.from({ world: 'data/world.json' });

// The application's own recovery UI: what it shows is the application's
// business, that this branch is reached is the guide's.
declare const showNotDownloadedYet: () => void;

class WorldScene extends Scene {
  public override async load(): Promise<void> {
    // #region guide:cache-miss
    try {
      const world = await this.loader.load(assets.world);
    } catch (error) {
      if (error instanceof AssetCacheMissError) {
        // Not "loading failed" - "this was never cached". A different message,
        // and often a different recovery.
        showNotDownloadedYet();
      }
    }
    // #endregion guide:cache-miss
  }
}

export { WorldScene };
