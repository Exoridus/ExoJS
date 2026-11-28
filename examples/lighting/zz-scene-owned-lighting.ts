import { Application, Color, Container, Graphics, Scene, type Seconds } from '@codexo/exojs';
import { LightmapLighting, OccluderComponent, PointLight } from '@codexo/exojs/lighting';
import { startExample } from '@examples/runtime';

// Evidence scene: options-only lighting in scene.systems, lights and occluders joining through scene membership.
class SceneOwnedLighting extends Scene {
  private readonly world = new Container();
  private readonly orbiting = new PointLight({ radius: 420, intensity: 2, color: new Color(255, 205, 150) });
  private readonly late = new PointLight({ radius: 300, intensity: 1.6, color: new Color(120, 180, 255) });
  private readonly blocks: Graphics[] = [];
  private occluder!: OccluderComponent;
  private elapsed = 0;
  private stage = 0;

  override init(): void {
    this.systems.add(new LightmapLighting({ ambient: new Color(40, 44, 56) }));

    const floor = new Graphics();

    floor.fillColor = new Color(170, 176, 190);
    floor.drawRectangle(0, 0, 1280, 720);
    this.world.addChild(floor);

    for (const [x, y, w, h] of [
      [420, 260, 60, 200],
      [760, 200, 200, 50],
      [820, 470, 80, 80],
    ]) {
      const block = new Graphics();

      block.fillColor = new Color(236, 227, 210);
      block.drawRectangle(0, 0, w, h);
      block.setPosition(x, y);
      this.blocks.push(block);
      this.world.addChild(block);
    }

    this.blocks[0].addComponent(new OccluderComponent());
    this.occluder = this.blocks[1].addComponent(new OccluderComponent());
    this.world.addChild(this.orbiting);
    this.root.addChild(this.world);
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;
    this.orbiting.setPosition(640 + Math.cos(this.elapsed * 0.9) * 260, 360 + Math.sin(this.elapsed * 0.9) * 180);

    // 2 s: a second light joins on its own; 4 s: the occluder component moves to another block.
    if (this.stage === 0 && this.elapsed > 2) {
      this.stage = 1;
      this.late.setPosition(1000, 600);
      this.world.addChild(this.late);
    } else if (this.stage === 1 && this.elapsed > 4) {
      this.stage = 2;
      this.blocks[1].removeComponent(this.occluder);
      this.blocks[2].addComponent(this.occluder);
    }
  }
}

const app = new Application({
  scenes: { SceneOwnedLighting },
  canvas: { width: 1280, height: 720, mount: document.body },
  clearColor: new Color(6, 7, 12),
});
await startExample(app, () => app.start(SceneOwnedLighting));
