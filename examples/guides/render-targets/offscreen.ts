import { Container, type RenderingContext, RenderTexture, Scene, Sprite } from '@codexo/exojs';

class OffscreenScene extends Scene {
  private offscreen!: RenderTexture;
  private someSprite = new Sprite();
  private someContainer = new Container();
  private display!: Sprite;

  // #region guide:render-offscreen
  override init(): void {
    const backend = this.app.backend;

    this.offscreen = new RenderTexture(256, 256);

    // Redirect rendering to the off-screen target
    backend.setRenderTarget(this.offscreen);

    backend.clear();
    this.someSprite.render(backend);
    this.someContainer.render(backend);

    // Restore the canvas
    backend.setRenderTarget(null);
  }
  // #endregion guide:render-offscreen

  private showResult(): void {
    // #region guide:display-target
    this.display = new Sprite(this.offscreen);
    this.display.setPosition(400, 300);
    this.display.setAnchor(0.5);
    this.addChild(this.display);
    // #endregion guide:display-target
  }
}

class TwoPassScene extends Scene {
  private offscreen = new RenderTexture(256, 256);
  private worldLayer = new Container();
  private hud = new Container();
  private display = new Sprite();

  // #region guide:two-pass-draw
  override draw(context: RenderingContext): void {
    // 1. Draw game world into the off-screen target
    context.backend.setRenderTarget(this.offscreen);
    context.backend.clear();
    this.worldLayer.render(context.backend);
    context.backend.setRenderTarget(null);

    // 2. Draw the main scene - the off-screen result is now a texture.
    //    The canvas itself was already cleared before `draw` ran.
    context.render(this.display);
    context.render(this.hud);
  }
  // #endregion guide:two-pass-draw
}

class CachedLayerScene extends Scene {
  private staticLayer = new Container();
  private cache!: RenderTexture;
  private cachedSprite!: Sprite;

  // #region guide:cache-static-layer
  override init(): void {
    this.buildComplexScene(); // builds this.staticLayer

    this.cache = new RenderTexture(Math.ceil(this.staticLayer.width), Math.ceil(this.staticLayer.height));

    const backend = this.app.backend;
    backend.setRenderTarget(this.cache);
    backend.clear();
    this.staticLayer.render(backend);
    backend.setRenderTarget(null);

    this.cachedSprite = new Sprite(this.cache);
    this.staticLayer.visible = false;
  }

  override draw(context: RenderingContext): void {
    context.render(this.cachedSprite);
    // ... dynamic content on top ...
  }
  // #endregion guide:cache-static-layer

  private buildComplexScene(): void {
    this.addChild(this.staticLayer);
  }
}

export { CachedLayerScene, OffscreenScene, TwoPassScene };
