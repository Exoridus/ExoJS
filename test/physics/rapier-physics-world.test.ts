import { Drawable } from 'rendering/Drawable';
import { Graphics } from 'rendering/primitives/Graphics';
import {
    createRapierPhysicsWorld,
    type PhysicsBodyType,
    type RapierModuleLoader,
} from 'physics/RapierPhysicsWorld';

type FakeBodyType = 'dynamic' | 'static' | 'kinematic';
type FakeShapeType = 'box' | 'circle';

interface FakeOverlapEvent {
    readonly handleA: number;
    readonly handleB: number;
    readonly started: boolean;
}

class FakeVector2 {
    public constructor(public x: number, public y: number) {}
}

class FakeRigidBodyDesc {
    public translationX = 0;
    public translationY = 0;
    public rotation = 0;
    public linearDamping = 0;
    public angularDamping = 0;
    public gravityScale = 1;
    public lockRotation = false;

    public constructor(public readonly type: FakeBodyType) {}

    public setTranslation(x: number, y: number): this {
        this.translationX = x;
        this.translationY = y;

        return this;
    }

    public setRotation(rotation: number): this {
        this.rotation = rotation;

        return this;
    }

    public setLinearDamping(damping: number): this {
        this.linearDamping = damping;

        return this;
    }

    public setAngularDamping(damping: number): this {
        this.angularDamping = damping;

        return this;
    }

    public setGravityScale(scale: number): this {
        this.gravityScale = scale;

        return this;
    }

    public lockRotations(locked: boolean): this {
        this.lockRotation = locked;

        return this;
    }
}

class FakeColliderDesc {
    public translationX = 0;
    public translationY = 0;
    public rotation = 0;
    public sensor = false;
    public friction = 0.5;
    public restitution = 0;
    public density = 1;
    public collisionGroups = 0x0001FFFF;
    public solverGroups = 0x0001FFFF;
    public activeEvents = 0;

    public constructor(
        public readonly shapeType: FakeShapeType,
        public readonly width: number,
        public readonly height: number,
        public readonly radius: number,
    ) {}

    public setTranslation(x: number, y: number): this {
        this.translationX = x;
        this.translationY = y;

        return this;
    }

    public setRotation(rotation: number): this {
        this.rotation = rotation;

        return this;
    }

    public setSensor(sensor: boolean): this {
        this.sensor = sensor;

        return this;
    }

    public setFriction(friction: number): this {
        this.friction = friction;

        return this;
    }

    public setRestitution(restitution: number): this {
        this.restitution = restitution;

        return this;
    }

    public setDensity(density: number): this {
        this.density = density;

        return this;
    }

    public setCollisionGroups(groups: number): this {
        this.collisionGroups = groups;

        return this;
    }

    public setSolverGroups(groups: number): this {
        this.solverGroups = groups;

        return this;
    }

    public setActiveEvents(activeEvents: number): this {
        this.activeEvents = activeEvents;

        return this;
    }
}

class FakeRigidBody {
    public velocityX = 0;
    public velocityY = 0;
    public x: number;
    public y: number;
    public rotationValue: number;
    public readonly gravityScale: number;

    public constructor(
        public readonly handle: number,
        public readonly type: FakeBodyType,
        descriptor: FakeRigidBodyDesc,
    ) {
        this.x = descriptor.translationX;
        this.y = descriptor.translationY;
        this.rotationValue = descriptor.rotation;
        this.gravityScale = descriptor.gravityScale;
    }

    public translation(): { x: number; y: number; } {
        return { x: this.x, y: this.y };
    }

    public rotation(): number {
        return this.rotationValue;
    }

    public setTranslation(translation: { x: number; y: number; }): void {
        this.x = translation.x;
        this.y = translation.y;
    }

    public setRotation(rotation: number): void {
        this.rotationValue = rotation;
    }
}

class FakeCollider {
    public collisionGroups: number;
    public solverGroups: number;

    public constructor(
        public readonly handle: number,
        public readonly body: FakeRigidBody,
        public readonly descriptor: FakeColliderDesc,
    ) {
        this.collisionGroups = descriptor.collisionGroups;
        this.solverGroups = descriptor.solverGroups;
    }

    public setCollisionGroups(groups: number): void {
        this.collisionGroups = groups;
    }

    public setSolverGroups(groups: number): void {
        this.solverGroups = groups;
    }
}

class FakeEventQueue {
    private _events: Array<FakeOverlapEvent> = [];

    public setEvents(events: Array<FakeOverlapEvent>): void {
        this._events = events;
    }

    public drainCollisionEvents(callback: (handleA: number, handleB: number, started: boolean) => void): void {
        for (const event of this._events) {
            callback(event.handleA, event.handleB, event.started);
        }

        this._events = [];
    }
}

class FakeWorld {
    public gravity: FakeVector2;
    public timestep = 1 / 60;

    private _nextBodyHandle = 1;
    private _nextColliderHandle = 1;
    private _bodies: Array<FakeRigidBody> = [];
    private _colliders: Array<FakeCollider> = [];
    private _previousOverlaps: Set<string> = new Set<string>();

    public constructor(gravity: FakeVector2) {
        this.gravity = gravity;
    }

    public createRigidBody(descriptor: FakeRigidBodyDesc): FakeRigidBody {
        const body = new FakeRigidBody(this._nextBodyHandle++, descriptor.type, descriptor);

        this._bodies.push(body);

        return body;
    }

    public createCollider(descriptor: FakeColliderDesc, body: FakeRigidBody): FakeCollider {
        const collider = new FakeCollider(this._nextColliderHandle++, body, descriptor);

        this._colliders.push(collider);

        return collider;
    }

    public removeRigidBody(body: FakeRigidBody): void {
        this._bodies = this._bodies.filter((candidate) => candidate !== body);
        this._colliders = this._colliders.filter((collider) => collider.body !== body);
    }

    public step(eventQueue?: FakeEventQueue): void {
        for (const body of this._bodies) {
            if (body.type !== 'dynamic') {
                continue;
            }

            body.velocityY += this.gravity.y * this.timestep * body.gravityScale;
            body.x += body.velocityX * this.timestep;
            body.y += body.velocityY * this.timestep;
        }

        const currentOverlaps: Set<string> = new Set<string>();
        const events: Array<FakeOverlapEvent> = [];

        for (let indexA = 0; indexA < this._colliders.length; indexA++) {
            const first = this._colliders[indexA];

            for (let indexB = indexA + 1; indexB < this._colliders.length; indexB++) {
                const second = this._colliders[indexB];

                if (!this.shouldCollide(first, second)) {
                    continue;
                }

                const key = this.getPairKey(first.handle, second.handle);
                const overlaps = this.overlaps(first, second);

                if (overlaps) {
                    currentOverlaps.add(key);

                    if (!first.descriptor.sensor && !second.descriptor.sensor) {
                        this.resolveSolidCollision(first, second);
                    }

                    if (!this._previousOverlaps.has(key)) {
                        events.push({
                            handleA: first.handle,
                            handleB: second.handle,
                            started: true,
                        });
                    }
                } else if (this._previousOverlaps.has(key)) {
                    events.push({
                        handleA: first.handle,
                        handleB: second.handle,
                        started: false,
                    });
                }
            }
        }

        for (const key of this._previousOverlaps) {
            if (!currentOverlaps.has(key)) {
                const [handleA, handleB] = key.split(':').map((value) => Number.parseInt(value, 10));

                if (!events.some((event) => (
                    event.handleA === handleA
                    && event.handleB === handleB
                    && event.started === false
                ))) {
                    events.push({
                        handleA,
                        handleB,
                        started: false,
                    });
                }
            }
        }

        this._previousOverlaps = currentOverlaps;
        eventQueue?.setEvents(events);
    }

    private shouldCollide(first: FakeCollider, second: FakeCollider): boolean {
        const firstMembership = (first.collisionGroups >>> 16) & 0xFFFF;
        const firstFilter = first.collisionGroups & 0xFFFF;
        const secondMembership = (second.collisionGroups >>> 16) & 0xFFFF;
        const secondFilter = second.collisionGroups & 0xFFFF;

        return (firstFilter & secondMembership) !== 0 && (secondFilter & firstMembership) !== 0;
    }

    private overlaps(first: FakeCollider, second: FakeCollider): boolean {
        const firstShape = this.getShape(first);
        const secondShape = this.getShape(second);

        if (firstShape.type === 'box' && secondShape.type === 'box') {
            return (
                Math.abs(firstShape.centerX - secondShape.centerX) <= (firstShape.halfWidth + secondShape.halfWidth)
                && Math.abs(firstShape.centerY - secondShape.centerY) <= (firstShape.halfHeight + secondShape.halfHeight)
            );
        }

        if (firstShape.type === 'circle' && secondShape.type === 'circle') {
            const dx = firstShape.centerX - secondShape.centerX;
            const dy = firstShape.centerY - secondShape.centerY;

            return (dx * dx) + (dy * dy) <= (firstShape.radius + secondShape.radius) ** 2;
        }

        const circle = firstShape.type === 'circle'
            ? firstShape
            : secondShape.type === 'circle'
                ? secondShape
                : null;
        const box = firstShape.type === 'box'
            ? firstShape
            : secondShape.type === 'box'
                ? secondShape
                : null;

        if (!circle || !box) {
            return false;
        }

        const closestX = Math.max(box.centerX - box.halfWidth, Math.min(circle.centerX, box.centerX + box.halfWidth));
        const closestY = Math.max(box.centerY - box.halfHeight, Math.min(circle.centerY, box.centerY + box.halfHeight));
        const dx = circle.centerX - closestX;
        const dy = circle.centerY - closestY;

        return (dx * dx) + (dy * dy) <= circle.radius ** 2;
    }

    private resolveSolidCollision(first: FakeCollider, second: FakeCollider): void {
        this.resolveDynamicAgainst(first, second);
        this.resolveDynamicAgainst(second, first);
    }

    private resolveDynamicAgainst(dynamicCollider: FakeCollider, staticCollider: FakeCollider): void {
        if (dynamicCollider.body.type !== 'dynamic' || staticCollider.body.type === 'dynamic') {
            return;
        }

        if (dynamicCollider.descriptor.shapeType !== 'box' || staticCollider.descriptor.shapeType !== 'box') {
            return;
        }

        const dynamicHalfHeight = dynamicCollider.descriptor.height / 2;
        const staticHalfHeight = staticCollider.descriptor.height / 2;
        const staticCenterY = staticCollider.body.y + staticCollider.descriptor.translationY;
        const targetY = staticCenterY - staticHalfHeight - dynamicHalfHeight;

        if (dynamicCollider.body.y > targetY) {
            dynamicCollider.body.y = targetY;
            dynamicCollider.body.velocityY = 0;
        }
    }

    private getPairKey(handleA: number, handleB: number): string {
        return handleA < handleB ? `${handleA}:${handleB}` : `${handleB}:${handleA}`;
    }

    private getShape(collider: FakeCollider):
        | { type: 'box'; centerX: number; centerY: number; halfWidth: number; halfHeight: number; }
        | { type: 'circle'; centerX: number; centerY: number; radius: number; } {
        const body = collider.body;
        const descriptor = collider.descriptor;
        const centerX = body.x + descriptor.translationX;
        const centerY = body.y + descriptor.translationY;

        if (descriptor.shapeType === 'box') {
            return {
                type: 'box',
                centerX,
                centerY,
                halfWidth: descriptor.width / 2,
                halfHeight: descriptor.height / 2,
            };
        }

        return {
            type: 'circle',
            centerX,
            centerY,
            radius: descriptor.radius,
        };
    }
}

const createFakeRapierModule = () => {
    const init = jest.fn(async () => undefined);

    return {
        init,
        Vector2: FakeVector2,
        World: FakeWorld,
        EventQueue: FakeEventQueue,
        ActiveEvents: {
            COLLISION_EVENTS: 1,
        },
        RigidBodyDesc: {
            dynamic: () => new FakeRigidBodyDesc('dynamic'),
            fixed: () => new FakeRigidBodyDesc('static'),
            kinematicPositionBased: () => new FakeRigidBodyDesc('kinematic'),
        },
        ColliderDesc: {
            cuboid: (halfWidth: number, halfHeight: number) => new FakeColliderDesc('box', halfWidth * 2, halfHeight * 2, 0),
            ball: (radius: number) => new FakeColliderDesc('circle', 0, 0, radius),
        },
    };
};

const createWorld = async (
    options: {
        gravityX?: number;
        gravityY?: number;
    } = {},
) => {
    const module = createFakeRapierModule();
    const moduleLoader: RapierModuleLoader = async () => {
        return module as unknown as Awaited<ReturnType<RapierModuleLoader>>;
    };
    const world = await createRapierPhysicsWorld({
        gravityX: options.gravityX,
        gravityY: options.gravityY,
        moduleLoader,
    });

    return { world, module };
};

const createNode = (x: number, y: number): Drawable => {
    const node = new Drawable();

    node.setPosition(x, y);

    return node;
};

describe('RapierPhysicsWorld', () => {
    test('steps bodies and syncs physics-driven node transforms', async () => {
        const { world } = await createWorld({ gravityY: 10 });
        const node = createNode(0, 0);

        world.attachNode(node, {
            type: 'dynamic',
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });

        world.step(1);
        const firstY = node.y;

        world.step(1);

        expect(firstY).toBeGreaterThan(0);
        expect(node.y).toBeGreaterThan(firstY);
    });

    test('supports explicit teleport and manual node/body sync semantics', async () => {
        const { world } = await createWorld({ gravityY: 10 });
        const node = createNode(5, 6);
        const binding = world.attachNode(node, {
            type: 'dynamic',
            syncMode: 'manual',
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });

        binding.teleport(12, 18, 1.2);

        expect(node.x).toBe(12);
        expect(node.y).toBe(18);
        expect(node.rotation).toBe(1.2);
        expect(binding.x).toBe(12);
        expect(binding.y).toBe(18);
        expect(binding.rotation).toBe(1.2);

        node.setPosition(30, 31);
        node.setRotation(0.7);
        binding.syncBodyFromNode();
        world.step(1);

        expect(node.y).toBe(31);
        expect(binding.y).toBeGreaterThan(31);

        binding.syncNodeFromBody();

        expect(node.y).toBe(binding.y);
    });

    test('applies collision groups and masks predictably', async () => {
        const allowed = await createWorld({ gravityY: 0 });
        const filtered = await createWorld({ gravityY: 0 });
        const allowedEvents: Array<unknown> = [];
        const filteredEvents: Array<unknown> = [];
        const firstAllowed = createNode(0, 0);
        const secondAllowed = createNode(0, 0);
        const firstFiltered = createNode(0, 0);
        const secondFiltered = createNode(0, 0);

        allowed.world.onCollisionEnter.add((event) => {
            allowedEvents.push(event);
        });
        filtered.world.onCollisionEnter.add((event) => {
            filteredEvents.push(event);
        });

        allowed.world.attachNode(firstAllowed, {
            type: 'dynamic',
            collisionFilter: {
                membership: 0,
                collidesWith: [1],
            },
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });
        allowed.world.attachNode(secondAllowed, {
            type: 'static',
            collisionFilter: {
                membership: 1,
                collidesWith: [0],
            },
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });
        filtered.world.attachNode(firstFiltered, {
            type: 'dynamic',
            collisionFilter: {
                membership: 0,
                collidesWith: [2],
            },
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });
        filtered.world.attachNode(secondFiltered, {
            type: 'static',
            collisionFilter: {
                membership: 1,
                collidesWith: [0],
            },
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });

        allowed.world.step(1 / 60);
        filtered.world.step(1 / 60);

        expect(allowedEvents.length).toBe(1);
        expect(filteredEvents.length).toBe(0);
    });

    test('distinguishes trigger sensors from solid colliders', async () => {
        const triggerWorld = await createWorld({ gravityY: 20 });
        const solidWorld = await createWorld({ gravityY: 20 });
        const triggerEvents: Array<unknown> = [];
        const collisionEvents: Array<unknown> = [];
        const triggerPlayer = createNode(0, 0);
        const solidPlayer = createNode(0, 0);

        triggerWorld.world.onTriggerEnter.add((event) => {
            triggerEvents.push(event);
        });
        triggerWorld.world.onCollisionEnter.add((event) => {
            collisionEvents.push(event);
        });

        triggerWorld.world.attachNode(triggerPlayer, {
            type: 'dynamic',
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });
        triggerWorld.world.attachNode(createNode(0, 20), {
            type: 'static',
            trigger: true,
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });
        solidWorld.world.attachNode(solidPlayer, {
            type: 'dynamic',
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });
        solidWorld.world.attachNode(createNode(0, 20), {
            type: 'static',
            shape: {
                type: 'box',
                width: 10,
                height: 10,
            },
        });

        triggerWorld.world.step(1);
        solidWorld.world.step(1);

        expect(triggerEvents.length).toBe(1);
        expect(collisionEvents.length).toBe(0);
        expect(triggerPlayer.y).toBeGreaterThan(10);
        expect(solidPlayer.y).toBeLessThanOrEqual(10);
    });

    test('updates debug graphics without breaking world stepping', async () => {
        const { world } = await createWorld({ gravityY: 10 });
        const dynamicNode = createNode(0, 0);
        const graphics = new Graphics();

        world.attachNode(dynamicNode, {
            type: 'dynamic',
            shape: {
                type: 'box',
                width: 12,
                height: 12,
            },
        });
        world.attachNode(createNode(24, 0), {
            type: 'static',
            trigger: true,
            shape: {
                type: 'circle',
                radius: 8,
            },
        });

        world.updateDebugGraphics(graphics);
        const firstRenderChildCount = graphics.children.length;

        world.step(1 / 60);
        world.updateDebugGraphics(graphics);

        expect(firstRenderChildCount).toBeGreaterThan(0);
        expect(graphics.children.length).toBe(firstRenderChildCount);
        expect(dynamicNode.y).toBeGreaterThan(0);
    });

    test('fails clearly when Rapier is unavailable', async () => {
        const moduleLoader: RapierModuleLoader = async () => {
            throw new Error('module not found');
        };

        await expect(createRapierPhysicsWorld({ moduleLoader })).rejects.toThrow('Rapier physics module is unavailable.');
    });

    test('keeps integration optional until a world is created', () => {
        expect(typeof createRapierPhysicsWorld).toBe('function');
        expect(() => createNode(0, 0)).not.toThrow();
    });
});
