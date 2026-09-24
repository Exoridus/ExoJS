// #region guide:basic-lightmap
import { Application, Color, Graphics, type RenderingContext, Scene } from '@codexo/exojs';
import { LightmapLighting, PointLight } from '@codexo/exojs-lighting';

class LightingScene extends Scene {
  override init(): void {
    const lighting = new LightmapLighting(this.app, { ambient: new Color(25, 25, 35) });
    const floor = new Graphics();
    const lamp = new PointLight({ radius: 360, color: new Color(255, 190, 100) });

    this.systems.add(lighting);
    floor.fillColor = new Color(180, 190, 210);
    floor.drawRectangle(0, 0, this.app.width, this.app.height);
    lamp.setPosition(this.app.width / 2, this.app.height / 2);
    this.root.addChild(floor, lamp);
    lighting.add(lamp);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { LightingScene },
  canvas: { width: 800, height: 600, mount: 'body' },
  clearColor: Color.black,
});

await app.start(LightingScene);
// #endregion guide:basic-lightmap
