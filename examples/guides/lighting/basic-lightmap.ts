// #region guide:basic-lightmap
import { Application, Color, Graphics, Scene } from '@codexo/exojs';
import { LightmapLighting, PointLight } from '@codexo/exojs/lighting';

class LightingScene extends Scene {
  override init(): void {
    const floor = new Graphics();
    const lamp = new PointLight({ radius: 360, color: new Color(255, 190, 100) });

    // Takes its application and scene from the registry; the lamp joins it on its own.
    this.systems.add(new LightmapLighting({ ambient: new Color(25, 25, 35) }));
    floor.fillColor = new Color(180, 190, 210);
    floor.drawRectangle(0, 0, this.app.width, this.app.height);
    lamp.setPosition(this.app.width / 2, this.app.height / 2);
    this.root.addChild(floor, lamp);
  }
}

const app = new Application({
  scenes: { LightingScene },
  canvas: { width: 800, height: 600, mount: 'body' },
  clearColor: Color.black,
});

await app.start(LightingScene);
// #endregion guide:basic-lightmap
