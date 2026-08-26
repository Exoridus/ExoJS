import { type Filter, logger, Scene, type Seconds, type Texture } from '@codexo/exojs';
import type { RenderPassInspectorLayer } from '@codexo/exojs/debug';

class GameScene extends Scene {
  private texture!: Texture;
  private inspector!: RenderPassInspectorLayer;

  // #region guide:log-once
  override update(delta: Seconds): void {
    if (this.texture.width > 4096) {
      logger.warn('Texture exceeds 4096px - this may hurt performance on mobile GPUs.', { source: 'rendering', once: 'huge-texture' });
    }
  }
  // #endregion guide:log-once

  private dumpPasses(): void {
    // #region guide:inspector-dump
    // ... game logic ...

    console.log(`Passes this frame: ${this.inspector.totalPasses}`);
    for (const entry of this.inspector.entries) {
      const filterNames = entry.filters.map((f: Filter) => f.constructor.name).join(', ');
      console.log(
        `${entry.drawableLabel} ${entry.width}x${entry.height}` +
          ` filters=[${filterNames}]${entry.hasMask ? ' mask' : ''}${entry.cachedAsTexture ? ' cached' : ''}`,
      );
    }
    // #endregion guide:inspector-dump
  }
}

export { GameScene };
