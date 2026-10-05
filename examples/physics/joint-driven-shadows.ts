import { Application, Color, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, type Seconds, SystemOrder } from '@codexo/exojs';
import { LightmapLighting, PhysicsOccluder, PointLight } from '@codexo/exojs-lighting';
import { BoxShape, CircleShape, type PhysicsBody, PhysicsWorld, RevoluteJoint } from '@codexo/exojs-physics';
import { mountControls } from '@examples/runtime';

const toDegrees = (radians: number): number => Math.round((Math.atan2(Math.sin(radians), Math.cos(radians)) * 180) / Math.PI);

const makeBar = (width: number, color: Color): Graphics => {
  const bar = new Graphics();
  bar.fillColor = color;
  bar.drawRoundedRectangle(-width / 2, -17, width, 34, 16);
  bar.fillColor = new Color(255, 232, 177);
  bar.drawCircle(-width / 2 + 15, 0, 7);
  bar.drawCircle(width / 2 - 15, 0, 7);
  return bar;
};

class JointShadowsScene extends Scene {
  private readonly backdrop = new Graphics();
  private readonly anchor = new Graphics();
  private readonly arm = makeBar(300, new Color(92, 197, 213));
  private world!: PhysicsWorld;
  private lighting!: LightmapLighting;
  private endBody!: PhysicsBody;
  private hinge!: RevoluteJoint;
  private dragging = false;
  private targetAngle = 0;
  private hud!: ReturnType<typeof mountControls>;
  private statusClock = 0;

  override init(): void {
    this.backdrop.fillColor = new Color(27, 39, 56);
    this.backdrop.drawRectangle(0, 0, 1280, 720);
    this.backdrop.lineColor = new Color(72, 100, 128, 0.25);
    this.backdrop.lineWidth = 2;
    for (let x = 80; x < 1280; x += 80) {
      this.backdrop.drawLine(x, 0, x, 720);
    }

    for (let y = 80; y < 720; y += 80) {
      this.backdrop.drawLine(0, y, 1280, y);
    }

    this.world = new PhysicsWorld({ gravity: { x: 0, y: 560 } });
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.lighting = new LightmapLighting(this.app, { ambient: new Color(42, 46, 66), lightResolution: 0.5, shadowResolution: 256 });
    this.systems.add(this.lighting);
    this.lighting.occludeFrom(new PhysicsOccluder(this.world, { staticOnly: false }));
    this.lighting.add(new PointLight({ radius: 1000, intensity: 3.2, softness: 0.18, color: new Color(255, 211, 144) })).setPosition(430, 350);

    this.anchor.fillColor = new Color(245, 217, 161);
    this.anchor.drawCircle(0, 0, 23);
    const fixed = this.world.attach(this.anchor, { type: 'static', position: { x: 650, y: 220 }, shape: new CircleShape(23) });
    this.endBody = this.world.attach(this.arm, {
      type: 'dynamic',
      position: { x: 800, y: 220 },
      shape: new BoxShape(300, 34),
      density: 0.08,
      friction: 0.4,
    });
    // The hub's collider overlaps the arm's end: without collideConnected: false
    // the contact pushes the arm off the hinge the joint holds it to. The torque
    // has to exceed what gravity exerts on the 300 px arm about its end.
    this.hinge = this.world.addJoint(
      new RevoluteJoint({ bodyA: fixed, bodyB: this.endBody, anchor: { x: 650, y: 220 }, maxMotorTorque: 1_000_000_000, collideConnected: false }),
    );

    this.hud = mountControls({
      title: 'Joint-Driven Shadows',
      controls: [{ keys: 'Drag', action: 'pull the hinged arm through the light' }],
      status: 'The collider casts a shadow as its revolute joint moves.',
      hint: 'PhysicsOccluder includes dynamic bodies here; its static-only default would omit the moving arm.',
    });
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onEnd);
  }

  private readonly onDown = (pointer: { x: number; y: number }): void => {
    if (Math.hypot(pointer.x - this.endBody.x, pointer.y - this.endBody.y) > 170) {
      return;
    }

    this.onEnd();
    this.dragging = true;
    this.hinge.enableMotor = true;
    this.onMove(pointer);
    this.hud.setStatus('Dragging the arm; its physics collider drives the changing shadow.');
  };
  private readonly onMove = (pointer: { x: number; y: number }): void => {
    if (!this.dragging) {
      return;
    }

    this.targetAngle = Math.atan2(pointer.y - 220, pointer.x - 650);
    this.endBody.wake();
    this.hud.setStatus(`Aim ${toDegrees(this.targetAngle)} degrees; arm ${toDegrees(this.endBody.angle)} degrees.`);
  };
  private readonly onEnd = (): void => {
    if (!this.dragging) {
      return;
    }

    this.dragging = false;
    this.hinge.enableMotor = false;
    this.hinge.motorSpeed = 0;
    this.hud.setStatus('Released. The hinged arm settles under gravity.');
  };

  override update(delta: Seconds): void {
    if (this.dragging) {
      // The body angle accumulates whole turns while atan2 stays within +-pi:
      // steer by the shortest signed difference, not the raw one.
      const difference = this.targetAngle - this.endBody.angle;
      const error = Math.atan2(Math.sin(difference), Math.cos(difference));

      this.hinge.motorSpeed = Math.max(-6, Math.min(6, error * 10));
    }

    this.statusClock += delta;

    if (this.statusClock < 0.25) {
      return;
    }

    this.statusClock = 0;
    this.hud.setStatus(
      this.dragging
        ? `Aim ${toDegrees(this.targetAngle)} degrees; arm ${toDegrees(this.endBody.angle)} degrees.`
        : `Arm at (${this.endBody.x.toFixed(0)}, ${this.endBody.y.toFixed(0)}). Drag it to change its shadow.`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.backdrop);
    context.render(this.anchor);
    context.render(this.arm);
  }

  override destroy(): void {
    this.onEnd();
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onEnd);
    this.hud?.dispose();
    this.backdrop.destroy();
    this.anchor.destroy();
    this.arm.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { JointShadowsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(10, 16, 27),
});

await app.start(JointShadowsScene);
