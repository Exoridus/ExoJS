// Auto-generated from materials-playground.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Sprite, SystemOrder, Text, View } from '@codexo/exojs';
import { BoxShape, CircleShape, PhysicsWorld } from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel } from '@examples/runtime';
class MaterialsPlaygroundScene extends Scene {
  world;
  view = new View(640, 350, 1280, 700);
  balls = [];
  labels = [];
  ground;
  panel;
  init() {
    this.world = this.systems.add(new PhysicsWorld({ gravity: { x: 0, y: 900 }, fixedDelta: this.app.fixedTimeStep }), {
      order: SystemOrder.Physics,
    });
    this.ground = this.track(new Graphics());
    this.ground.fillColor = new Color(48, 65, 80);
    const materials = [
      { name: 'Wood', texture: assets.physicsWoodBall, friction: 0.45, restitution: 0.4 },
      { name: 'Metal', texture: assets.physicsMetalBall, friction: 0.08, restitution: 0.85 },
      { name: 'Stone', texture: assets.physicsStoneBall, friction: 0.9, restitution: 0.08 },
    ];
    materials.forEach((material, index) => {
      const floorY = 220 + index * 180;
      const sprite = this.track(new Sprite(this.loader.get(material.texture)).setAnchor(0.5));
      sprite.width = 64;
      sprite.height = 64;
      this.ground.drawRectangle(80, floorY, 1120, 12);
      const floor = this.track(new Graphics());
      this.world.attach(floor, {
        type: 'static',
        position: { x: 640, y: floorY + 6 },
        shape: new BoxShape(1120, 12),
        friction: 0.8,
        restitution: 0,
      });
      for (const x of [68, 1212]) {
        const wall = this.track(new Graphics());
        this.world.attach(wall, {
          type: 'static',
          position: { x, y: floorY - 100 },
          shape: new BoxShape(24, 220),
        });
      }
      const body = this.world.attach(sprite, {
        type: 'dynamic',
        position: { x: 190, y: floorY - 100 },
        shape: new CircleShape(32),
        friction: material.friction,
        restitution: material.restitution,
        // Locked rotation keeps surface friction visible as sliding instead of free rolling.
        fixedRotation: true,
      });
      this.balls.push({ sprite, body, startY: floorY - 100 });
      this.labels.push(
        this.track(
          new Text(`${material.name}   friction ${material.friction}   bounce ${material.restitution}`, {
            fontSize: 18,
            fillColor: new Color(209, 222, 232),
          }).setPosition(90, floorY + 22),
        ),
      );
    });
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
      actions: { 'Drop again': () => this.reset() },
    });
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.reset();
  }
  reset() {
    for (const { body, startY } of this.balls) {
      body.setTransform({ x: 190, y: startY }, 0);
      body.linearVelocityX = 300;
      body.linearVelocityY = 0;
      body.angularVelocity = 0;
    }
  }
  draw(context) {
    const viewport = this.panel.fit(this.app, this.app.canvas);
    const scale = Math.min(viewport.width / 1280, viewport.contentHeight / 700);
    this.view.reset(640, 350, viewport.width / scale, viewport.contentHeight / scale);
    this.view.setViewport(0, 0, 1, viewport.contentHeight / viewport.height);
    context.render(this.ground, { view: this.view });
    for (const { sprite } of this.balls) {
      context.render(sprite, { view: this.view });
    }
    this.labels.forEach((label, index) => {
      const point = this.view.worldToScreen(90, 242 + index * 180, this.app.width, this.app.height);
      label.style.fontSize = 12 * viewport.scale;
      label.setPosition(point.x, point.y);
      context.render(label);
    });
  }
  destroy() {
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { MaterialsPlaygroundScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(13, 21, 31),
});
await app.start(MaterialsPlaygroundScene);
