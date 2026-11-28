import { Container, Rectangle, Scene, SceneDirector, Time } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import {
  BoxShape,
  CharacterMovementComponent,
  Collider,
  KinematicMovementComponent,
  PhysicsBodyComponent,
  PhysicsWorld,
} from '../src/index';
import { createAppStub } from './sceneHarness';

const options = { type: 'kinematic' as const, colliders: [{ shape: new BoxShape(10, 10) }] };
const dt = Time.seconds(1 / 60);

class First extends Scene {}
class Second extends Scene {}

const setup = async () => {
  const { app, errors } = createAppStub();
  const director = new SceneDirector(app, { first: First, second: Second });

  await director.change(First);

  return { director, scene: director.currentScene!, errors };
};

describe('scene physics composition', () => {
  it('resolves a scene world and composes movement before joining a scene', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld({ gravity: { x: 0, y: 360 } }));
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    const movement = node.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    const character = node.addComponent(new CharacterMovementComponent());

    expect(physics.activeWorld).toBeNull();
    scene.addChild(node);
    expect(errors).toEqual([]);
    expect(physics.world).toBe(world);
    expect(movement.physics).toBe(physics);
    expect(character.movement).toBe(movement);
    expect(character.gravity).toBe(360);

    character.move(1);
    world.fixedUpdate(dt);
    expect(physics.body.x).toBeCloseTo(1);
    expect(physics.body.y).toBeCloseTo(0.1);
  });

  it('reports absent and ambiguous worlds and keeps explicit selection available', async () => {
    const { scene, errors } = await setup();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    scene.addChild(node);
    expect(errors.pop()?.message).toMatch(/no.*PhysicsWorld/i);
    expect(physics.activeWorld).toBeNull();

    const selected = scene.systems.add(new PhysicsWorld());
    scene.systems.add(new PhysicsWorld());
    physics.enabled = false;
    physics.enabled = true;
    expect(errors.pop()?.message).toMatch(/multiple.*PhysicsWorld/i);
    expect(physics.body.attached).toBe(false);

    const explicitNode = new Container();
    const explicit = explicitNode.addComponent(new PhysicsBodyComponent(selected, options));
    scene.addChild(explicitNode);
    expect(explicit.activeWorld).toBe(selected);
  });

  it('unregisters movement when its body is disabled and restores it without stale commands', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    const movement = node.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    scene.addChild(node);

    movement.move({ x: 1, y: 0 });
    physics.enabled = false;
    expect(physics.activeWorld).toBeNull();
    physics.enabled = true;
    world.fixedUpdate(dt);
    expect(physics.body.x).toBe(0);
    movement.move({ x: 1, y: 0 });
    world.fixedUpdate(dt);
    expect(physics.body.x).toBeCloseTo(1);
    expect(errors).toEqual([]);
  });

  it('accepts world-unit velocity commands with a distance cap', async () => {
    const { scene } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    const movement = node.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    scene.addChild(node);

    movement.moveVelocity({ x: 120, y: 0 }, 1.5);
    world.fixedUpdate(dt);
    expect(physics.body.x).toBeCloseTo(1.5);
    world.fixedUpdate(dt);
    expect(physics.body.x).toBeCloseTo(1.5);
    expect(() => movement.moveVelocity({ x: Infinity, y: 0 })).toThrow(RangeError);
  });

  it('clears character state on body removal and rejects reuse of a destroyed world', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld({ gravity: { x: 0, y: 360 } }));
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    const movement = node.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    const character = node.addComponent(new CharacterMovementComponent());
    scene.addChild(node);
    character.launch({ x: 0, y: -60 });
    world.fixedUpdate(dt);
    expect(character.velocity.y).toBeLessThan(0);

    node.removeComponent(physics);
    expect(physics.body.destroyed).toBe(false);
    expect(character.velocity.y).toBe(0);
    character.launch({ x: 100, y: 0 });
    node.addComponent(physics);
    world.fixedUpdate(dt);
    expect(physics.body.x).toBe(0);
    expect(physics.body.linearVelocityY).toBeCloseTo(6);

    world.destroy();
    expect(scene.systems.has(world)).toBe(false);
    expect(physics.activeWorld).toBeNull();
    expect(physics.body.destroyed).toBe(true);
    expect(character.velocity.y).toBe(0);
    expect(() => character.move(1)).not.toThrow();
    expect(movement.physics).toBe(physics);
    node.destroy();
    expect(errors).toEqual([]);

    const another = new Container();
    scene.addChild(another);
    another.addComponent(new PhysicsBodyComponent(options));
    expect(errors.pop()?.message).toMatch(/no live PhysicsWorld/);
  });

  it('detaches on registry removal and rejects implicit transfer to another world', async () => {
    const { director, scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    scene.addChild(node);

    scene.systems.remove(world);
    expect(world.bodies).toHaveLength(0);
    expect(physics.activeWorld).toBeNull();
    scene.removeChild(node);
    await director.change(Second);
    const destination = director.currentScene!;
    const other = destination.systems.add(new PhysicsWorld());
    physics.enabled = true;
    destination.addChild(node);
    expect(errors.pop()?.message).toMatch(/another world/i);
    expect(other.bodies).toHaveLength(0);
    expect(physics.body.destroyed).toBe(false);
  });

  it('retains its world while paused and reactivates with that world after retention', async () => {
    const { director, scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    const movement = node.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    scene.addChild(node);
    director.pause();
    expect(physics.activeWorld).toBe(world);

    await director.change(Second, { suspendCurrent: true });
    expect(physics.activeWorld).toBeNull();
    expect(physics.body.destroyed).toBe(false);
    await director.restore(First);
    expect(physics.activeWorld).toBe(world);
    movement.move({ x: 1, y: 0 });
    world.fixedUpdate(dt);
    expect(physics.body.x).toBeCloseTo(1);
    expect(errors).toEqual([]);
  });

  it('detaches automatic bodies even when a registry removal observer throws', async () => {
    const { scene } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    const failure = new Error('observer failure');
    scene.systems.onRemove.add(() => {
      throw failure;
    });
    scene.addChild(node);

    try {
      scene.systems.remove(world);
    } catch (error) {
      expect(error).toBe(failure);
    }

    expect(physics.activeWorld).toBeNull();
    expect(world.bodies).toHaveLength(0);
  });

  it('reports missing or incompatible same-node movement dependencies', async () => {
    const { scene, errors } = await setup();
    scene.systems.add(new PhysicsWorld());
    const missing = new Container();
    const movement = missing.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    scene.addChild(missing);
    expect(errors.pop()?.message).toMatch(/requires a PhysicsBodyComponent/);
    expect(movement.active).toBe(false);

    const invalid = new Container();
    invalid.addComponent(new PhysicsBodyComponent());
    const incompatible = invalid.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    scene.addChild(invalid);
    expect(errors.pop()?.message).toMatch(/only a kinematic body/);
    expect(incompatible.active).toBe(false);
  });

  it('waits for a disabled movement and resolves dependencies regardless of order before attachment', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const node = new Container();
    const character = node.addComponent(new CharacterMovementComponent({ gravity: 0 }));
    const movement = new KinematicMovementComponent({ maxSpeed: 60 });
    movement.enabled = false;
    node.addComponent(movement);
    const physics = node.addComponent(new PhysicsBodyComponent(options));

    scene.addChild(node);
    expect(character.active).toBe(true);
    movement.enabled = true;
    character.move(1);
    world.fixedUpdate(dt);
    expect(physics.body.x).toBeCloseTo(1);
    expect(errors).toEqual([]);
  });

  it('does not follow an automatic dependency reattached to another node', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const source = new Container();
    const destination = new Container();
    const physics = source.addComponent(new PhysicsBodyComponent(options));
    const movement = source.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    scene.addChild(source);
    scene.addChild(destination);

    source.removeComponent(physics);
    destination.addComponent(physics);
    physics.body.linearVelocityY = 30;
    movement.stop();
    expect(physics.body.linearVelocityY).toBe(30);
    movement.move({ x: 1, y: 0 });
    world.fixedUpdate(dt);
    expect(physics.body.x).toBe(0);
    const replacement = destination.addComponent(new KinematicMovementComponent({ maxSpeed: 60 }));
    replacement.move({ x: 1, y: 0 });
    world.fixedUpdate(dt);
    expect(physics.body.x).toBeCloseTo(1);
    expect(errors).toEqual([]);
  });

  it('rolls back the first binding when a node setter destroys its body component', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld());

    class SelfRemovingNode extends Container {
      public physics: PhysicsBodyComponent | null = null;

      public override setPosition(x: number, y = x): this {
        this.physics?.destroy();

        return super.setPosition(x, y);
      }
    }

    const node = new SelfRemovingNode();
    const physics = node.addComponent(new PhysicsBodyComponent(options));
    node.physics = physics;
    scene.addChild(node);
    expect(physics.body.destroyed).toBe(true);
    expect(world.bodies).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  it('snapshots box bounds in body-local units relative to the node origin', () => {
    class Panel extends Container {
      public override getLocalBounds() {
        return this.bounds;
      }

      private readonly bounds = new Rectangle(0, 0, 16, 12);
    }
    const node = new Panel();
    node.setOrigin(2, 3);
    node.setScale(2, 3);
    const collider = Collider.boxFromBounds(node);

    expect(collider.shape).toMatchObject({ width: 32, height: 36 });
    expect([collider.offsetX, collider.offsetY]).toEqual([12, 9]);
    node.setOrigin(Infinity, 3);
    expect(() => Collider.boxFromBounds(node)).toThrow(/finite center/);
  });

  it('preserves the world pose when reparented under a translated and rotated parent', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld());
    const node = new Container();
    const parent = new Container();
    parent.setPosition(50, 60).setRotation(90);
    scene.addChild(parent);
    scene.addChild(node);
    const physics = node.addComponent(new PhysicsBodyComponent({ ...options, position: { x: 10, y: 20 }, angle: 0.25 }));

    parent.addChild(node);
    world.fixedUpdate(dt);
    const transform = node.getWorldTransform();
    expect(transform.x).toBeCloseTo(10);
    expect(transform.y).toBeCloseTo(20);
    expect(Math.atan2(transform.c, transform.a)).toBeCloseTo(0.25);
    expect(physics.activeWorld).toBe(world);
    expect(errors).toEqual([]);
  });

  it('interpolates in world space beneath a moving parent', async () => {
    const { scene, errors } = await setup();
    const world = scene.systems.add(new PhysicsWorld({ interpolation: true, frameAlphaSource: () => 0.5 }));
    const node = new Container();
    const parent = new Container();
    parent.setPosition(30, 40).setRotation(30);
    scene.addChild(parent);
    parent.addChild(node);
    const physics = node.addComponent(new PhysicsBodyComponent({ ...options, position: { x: 10, y: 20 }, angle: 0.25 }));
    physics.body.linearVelocityX = 120;

    world.fixedUpdate(dt);
    parent.setPosition(50, 80).setRotation(90);
    world.update(dt);
    const transform = node.getWorldTransform();
    expect(transform.x).toBeCloseTo(11);
    expect(transform.y).toBeCloseTo(20);
    expect(Math.atan2(transform.c, transform.a)).toBeCloseTo(0.25);
    expect(physics.body.x).toBeCloseTo(12);
    expect(errors).toEqual([]);
  });
});
