import { Color } from '@/core/Color';
import { Signal } from '@/core/Signal';
import type { SceneNode } from '@/core/SceneNode';
import { Graphics } from '@/rendering/primitives/Graphics';

const rapierModuleName = '@dimforge/rapier2d-compat';
const maxCollisionGroup = 15;
const fullGroupMask = 0xFFFF;
const defaultDeltaSeconds = 1 / 60;

export type PhysicsBodyType = 'dynamic' | 'static' | 'kinematic';
export type PhysicsSyncMode = 'physicsToNode' | 'manual';

export interface PhysicsCollisionFilter {
    readonly membership?: number | ReadonlyArray<number>;
    readonly collidesWith?: number | ReadonlyArray<number>;
}

export interface PhysicsBoxShape {
    readonly type: 'box';
    readonly width: number;
    readonly height: number;
    readonly offsetX?: number;
    readonly offsetY?: number;
    readonly offsetRotation?: number;
}

export interface PhysicsCircleShape {
    readonly type: 'circle';
    readonly radius: number;
    readonly offsetX?: number;
    readonly offsetY?: number;
}

export type PhysicsColliderShape = PhysicsBoxShape | PhysicsCircleShape;

export interface PhysicsBodyOptions {
    readonly type?: PhysicsBodyType;
    readonly shape: PhysicsColliderShape;
    readonly trigger?: boolean;
    readonly syncMode?: PhysicsSyncMode;
    readonly friction?: number;
    readonly restitution?: number;
    readonly density?: number;
    readonly gravityScale?: number;
    readonly linearDamping?: number;
    readonly angularDamping?: number;
    readonly lockRotation?: boolean;
    readonly collisionFilter?: PhysicsCollisionFilter;
}

export interface RapierPhysicsDebugDrawOptions {
    readonly lineWidth?: number;
    readonly solidLineColor?: Color;
    readonly solidFillColor?: Color;
    readonly triggerLineColor?: Color;
    readonly triggerFillColor?: Color;
}

export interface RapierPhysicsEvent {
    readonly started: boolean;
    readonly trigger: boolean;
    readonly first: RapierPhysicsBinding;
    readonly second: RapierPhysicsBinding;
}

interface RapierVectorLike {
    x: number;
    y: number;
}

interface RapierRigidBodyDescLike {
    setTranslation(x: number, y: number): RapierRigidBodyDescLike;
    setRotation(rotation: number): RapierRigidBodyDescLike;
    setLinearDamping(damping: number): RapierRigidBodyDescLike;
    setAngularDamping(damping: number): RapierRigidBodyDescLike;
    setGravityScale(scale: number): RapierRigidBodyDescLike;
    lockRotations(locked: boolean): RapierRigidBodyDescLike;
}

interface RapierColliderDescLike {
    setTranslation(x: number, y: number): RapierColliderDescLike;
    setRotation(rotation: number): RapierColliderDescLike;
    setSensor(sensor: boolean): RapierColliderDescLike;
    setFriction(friction: number): RapierColliderDescLike;
    setRestitution(restitution: number): RapierColliderDescLike;
    setDensity(density: number): RapierColliderDescLike;
    setCollisionGroups(groups: number): RapierColliderDescLike;
    setSolverGroups(groups: number): RapierColliderDescLike;
    setActiveEvents(activeEvents: number): RapierColliderDescLike;
}

interface RapierRigidBodyLike {
    readonly handle: number;
    translation(): RapierVectorLike;
    rotation(): number;
    setTranslation(translation: RapierVectorLike, wakeUp: boolean): void;
    setRotation(rotation: number, wakeUp: boolean): void;
}

interface RapierColliderLike {
    readonly handle: number;
    setCollisionGroups(groups: number): void;
    setSolverGroups(groups: number): void;
}

interface RapierEventQueueLike {
    drainCollisionEvents(callback: (handleA: number, handleB: number, started: boolean) => void): void;
}

interface RapierWorldLike {
    gravity: RapierVectorLike;
    createRigidBody(descriptor: RapierRigidBodyDescLike): RapierRigidBodyLike;
    createCollider(descriptor: RapierColliderDescLike, body: RapierRigidBodyLike): RapierColliderLike;
    removeRigidBody(body: RapierRigidBodyLike): void;
    step(eventQueue?: RapierEventQueueLike): void;
}

interface RapierModuleLike {
    init?: () => Promise<void> | void;
    readonly vector2: new (x: number, y: number) => RapierVectorLike;
    readonly worldConstructor: new (gravity: RapierVectorLike) => RapierWorldLike;
    readonly eventQueueConstructor: new (autoDrain: boolean) => RapierEventQueueLike;
    readonly rigidBodyDescFactory: {
        dynamic(): RapierRigidBodyDescLike;
        fixed(): RapierRigidBodyDescLike;
        kinematicPositionBased?(): RapierRigidBodyDescLike;
        kinematicVelocityBased?(): RapierRigidBodyDescLike;
    };
    readonly colliderDescFactory: {
        cuboid(halfWidth: number, halfHeight: number): RapierColliderDescLike;
        ball(radius: number): RapierColliderDescLike;
    };
    readonly activeCollisionEvents?: number;
}

export type RapierModuleLoader = () => Promise<unknown>;

export interface RapierPhysicsWorldOptions {
    readonly gravityX?: number;
    readonly gravityY?: number;
    readonly moduleLoader?: RapierModuleLoader;
}

const defaultDebugDrawOptions = {
    lineWidth: 1,
    solidLineColor: new Color(64, 196, 255, 1),
    solidFillColor: new Color(64, 196, 255, 0.12),
    triggerLineColor: new Color(255, 180, 48, 1),
    triggerFillColor: new Color(255, 180, 48, 0.08),
} as const;

const resolveRapierModule = (module: unknown): RapierModuleLike => {
    const rapier = module as Partial<Record<string, unknown>>;
    const vector2 = rapier.Vector2;
    const worldConstructor = rapier.World;
    const eventQueueConstructor = rapier.EventQueue;
    const rigidBodyDescFactory = rapier.RigidBodyDesc;
    const colliderDescFactory = rapier.ColliderDesc;

    if (typeof vector2 !== 'function' || typeof worldConstructor !== 'function' || typeof eventQueueConstructor !== 'function') {
        throw new Error('Invalid Rapier module loader result. Expected Vector2, World, and EventQueue exports.');
    }

    if (
        typeof rigidBodyDescFactory !== 'object'
        || rigidBodyDescFactory === null
        || typeof colliderDescFactory !== 'object'
        || colliderDescFactory === null
    ) {
        throw new Error('Invalid Rapier module loader result. Expected RigidBodyDesc and ColliderDesc exports.');
    }

    const activeEvents = rapier.ActiveEvents as Partial<Record<string, unknown>> | undefined;
    const activeCollisionEvents = typeof activeEvents?.COLLISION_EVENTS === 'number'
        ? activeEvents.COLLISION_EVENTS
        : undefined;

    return {
        init: typeof rapier.init === 'function'
            ? rapier.init as () => Promise<void> | void
            : undefined,
        vector2: vector2 as new (x: number, y: number) => RapierVectorLike,
        worldConstructor: worldConstructor as new (gravity: RapierVectorLike) => RapierWorldLike,
        eventQueueConstructor: eventQueueConstructor as new (autoDrain: boolean) => RapierEventQueueLike,
        rigidBodyDescFactory: rigidBodyDescFactory as RapierModuleLike['rigidBodyDescFactory'],
        colliderDescFactory: colliderDescFactory as RapierModuleLike['colliderDescFactory'],
        activeCollisionEvents,
    };
};

const defaultRapierModuleLoader: RapierModuleLoader = async () => {
    return await import(rapierModuleName as string);
};

const assertFiniteNumber = (value: number, label: string): void => {
    if (!Number.isFinite(value)) {
        throw new Error(`${label} must be a finite number.`);
    }
};

const assertPositiveNumber = (value: number, label: string): void => {
    assertFiniteNumber(value, label);

    if (value <= 0) {
        throw new Error(`${label} must be greater than zero.`);
    }
};

const assertGroup = (group: number, label: string): void => {
    if (!Number.isInteger(group) || group < 0 || group > maxCollisionGroup) {
        throw new Error(`${label} must be an integer between 0 and ${maxCollisionGroup}.`);
    }
};

const toGroupMask = (groups: number | ReadonlyArray<number> | undefined, fallback: number): number => {
    if (groups === undefined) {
        return fallback;
    }

    if (typeof groups === 'number') {
        assertGroup(groups, 'collision group');

        return 1 << groups;
    }

    if (groups.length === 0) {
        return 0;
    }

    return groups.reduce((mask, group, index) => {
        assertGroup(group, `collision groups[${index}]`);

        return mask | (1 << group);
    }, 0);
};

const toPackedCollisionGroups = (filter?: PhysicsCollisionFilter): number => {
    const membershipMask = toGroupMask(filter?.membership, 1 << 0);
    const collisionMask = toGroupMask(filter?.collidesWith, fullGroupMask);

    return ((membershipMask & fullGroupMask) << 16) | (collisionMask & fullGroupMask);
};

const getOffset = (shape: PhysicsColliderShape): { x: number; y: number; } => ({
    x: shape.offsetX ?? 0,
    y: shape.offsetY ?? 0,
});

const rotatePoint = (x: number, y: number, rotation: number): { x: number; y: number; } => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    return {
        x: (x * cos) - (y * sin),
        y: (x * sin) + (y * cos),
    };
};

const assertShape = (shape: PhysicsColliderShape): void => {
    if (shape.type === 'box') {
        assertPositiveNumber(shape.width, 'Box width');
        assertPositiveNumber(shape.height, 'Box height');
        assertFiniteNumber(shape.offsetX ?? 0, 'Box offsetX');
        assertFiniteNumber(shape.offsetY ?? 0, 'Box offsetY');
        assertFiniteNumber(shape.offsetRotation ?? 0, 'Box offsetRotation');

        return;
    }

    assertPositiveNumber(shape.radius, 'Circle radius');
    assertFiniteNumber(shape.offsetX ?? 0, 'Circle offsetX');
    assertFiniteNumber(shape.offsetY ?? 0, 'Circle offsetY');
};

const assertBodyOptions = (options: PhysicsBodyOptions): void => {
    assertShape(options.shape);
    assertFiniteNumber(options.friction ?? 0, 'friction');
    assertFiniteNumber(options.restitution ?? 0, 'restitution');
    assertFiniteNumber(options.density ?? 0, 'density');
    assertFiniteNumber(options.gravityScale ?? 1, 'gravityScale');
    assertFiniteNumber(options.linearDamping ?? 0, 'linearDamping');
    assertFiniteNumber(options.angularDamping ?? 0, 'angularDamping');
    toPackedCollisionGroups(options.collisionFilter);
};

export class RapierPhysicsBinding {
    private readonly _world: RapierPhysicsWorld;
    private readonly _body: RapierRigidBodyLike;
    private readonly _collider: RapierColliderLike;
    private _syncMode: PhysicsSyncMode;

    public readonly node: SceneNode;
    public readonly bodyType: PhysicsBodyType;
    public readonly shape: PhysicsColliderShape;
    public readonly trigger: boolean;

    public constructor(
        world: RapierPhysicsWorld,
        node: SceneNode,
        body: RapierRigidBodyLike,
        collider: RapierColliderLike,
        options: PhysicsBodyOptions,
    ) {
        this._world = world;
        this.node = node;
        this._body = body;
        this._collider = collider;
        this.bodyType = options.type ?? 'dynamic';
        this.shape = options.shape;
        this.trigger = options.trigger ?? false;
        this._syncMode = options.syncMode ?? 'physicsToNode';
    }

    public get bodyHandle(): number {
        return this._body.handle;
    }

    public get colliderHandle(): number {
        return this._collider.handle;
    }

    public getBody(): RapierRigidBodyLike {
        return this._body;
    }

    public get syncMode(): PhysicsSyncMode {
        return this._syncMode;
    }

    public set syncMode(syncMode: PhysicsSyncMode) {
        this._syncMode = syncMode;
    }

    public get x(): number {
        return this._body.translation().x;
    }

    public get y(): number {
        return this._body.translation().y;
    }

    public get rotation(): number {
        return this._body.rotation();
    }

    public setSyncMode(syncMode: PhysicsSyncMode): this {
        this._syncMode = syncMode;

        return this;
    }

    public teleport(x: number, y: number, rotation = this.node.rotation): this {
        this._world.writeBodyTransform(this._body, x, y, rotation, true);
        this.node.setPosition(x, y);
        this.node.setRotation(rotation);

        return this;
    }

    public syncBodyFromNode(wakeUp = true): this {
        this._world.writeBodyTransform(
            this._body,
            this.node.x,
            this.node.y,
            this.node.rotation,
            wakeUp,
        );

        return this;
    }

    public syncNodeFromBody(): this {
        const translation = this._body.translation();

        this.node.setPosition(translation.x, translation.y);
        this.node.setRotation(this._body.rotation());

        return this;
    }

    public setCollisionFilter(filter?: PhysicsCollisionFilter): this {
        const groups = toPackedCollisionGroups(filter);

        this._collider.setCollisionGroups(groups);
        this._collider.setSolverGroups(groups);

        return this;
    }

    public destroy(): void {
        this._world.removeBinding(this);
    }
}

export class RapierPhysicsWorld {
    public readonly onCollisionEnter = new Signal<[RapierPhysicsEvent]>();
    public readonly onCollisionExit = new Signal<[RapierPhysicsEvent]>();
    public readonly onTriggerEnter = new Signal<[RapierPhysicsEvent]>();
    public readonly onTriggerExit = new Signal<[RapierPhysicsEvent]>();

    private readonly _rapier: RapierModuleLike;
    private readonly _world: RapierWorldLike;
    private readonly _eventQueue: RapierEventQueueLike;
    private readonly _bindings: Set<RapierPhysicsBinding> = new Set<RapierPhysicsBinding>();
    private readonly _nodeBindings: Map<SceneNode, RapierPhysicsBinding> = new Map<SceneNode, RapierPhysicsBinding>();
    private readonly _colliderBindings: Map<number, RapierPhysicsBinding> = new Map<number, RapierPhysicsBinding>();

    private constructor(rapier: RapierModuleLike, world: RapierWorldLike, eventQueue: RapierEventQueueLike) {
        this._rapier = rapier;
        this._world = world;
        this._eventQueue = eventQueue;
    }

    public static async create(options: RapierPhysicsWorldOptions = {}): Promise<RapierPhysicsWorld> {
        const moduleLoader = options.moduleLoader ?? defaultRapierModuleLoader;
        let loadedModule: unknown = null;

        try {
            loadedModule = await moduleLoader();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(
                `Rapier physics module is unavailable. Install "${rapierModuleName}" or provide a custom module loader. Original error: ${message}`,
                { cause: error },
            );
        }

        const rapier = resolveRapierModule(loadedModule);

        if (typeof rapier.init === 'function') {
            await rapier.init();
        }

        const gravityX = options.gravityX ?? 0;
        const gravityY = options.gravityY ?? 9.81;

        assertFiniteNumber(gravityX, 'gravityX');
        assertFiniteNumber(gravityY, 'gravityY');

        const world = new rapier.worldConstructor(new rapier.vector2(gravityX, gravityY));
        const eventQueue = new rapier.eventQueueConstructor(true);

        return new RapierPhysicsWorld(rapier, world, eventQueue);
    }

    public get gravity(): { x: number; y: number; } {
        return {
            x: this._world.gravity.x,
            y: this._world.gravity.y,
        };
    }

    public setGravity(x: number, y: number): this {
        assertFiniteNumber(x, 'gravityX');
        assertFiniteNumber(y, 'gravityY');

        this._world.gravity.x = x;
        this._world.gravity.y = y;

        return this;
    }

    public hasNode(node: SceneNode): boolean {
        return this._nodeBindings.has(node);
    }

    public getBinding(node: SceneNode): RapierPhysicsBinding | null {
        return this._nodeBindings.get(node) ?? null;
    }

    public attachNode(node: SceneNode, options: PhysicsBodyOptions): RapierPhysicsBinding {
        if (this._nodeBindings.has(node)) {
            throw new Error('This SceneNode is already attached to a physics body.');
        }

        assertBodyOptions(options);

        const bodyDescriptor = this.createBodyDescriptor(node, options);
        const body = this._world.createRigidBody(bodyDescriptor);
        const colliderDescriptor = this.createColliderDescriptor(options);
        const collider = this._world.createCollider(colliderDescriptor, body);
        const binding = new RapierPhysicsBinding(this, node, body, collider, options);

        this._bindings.add(binding);
        this._nodeBindings.set(node, binding);
        this._colliderBindings.set(collider.handle, binding);

        return binding;
    }

    public detachNode(node: SceneNode): this {
        const binding = this._nodeBindings.get(node);

        if (binding) {
            this.removeBinding(binding);
        }

        return this;
    }

    public step(deltaSeconds = defaultDeltaSeconds): this {
        assertFiniteNumber(deltaSeconds, 'deltaSeconds');

        if (deltaSeconds < 0) {
            throw new Error('deltaSeconds must be zero or greater.');
        }

        this.applyStepDelta(deltaSeconds);
        this._world.step(this._eventQueue);
        this.drainCollisionEvents();
        this.syncNodeTransforms();

        return this;
    }

    public syncNodeTransforms(): this {
        for (const binding of this._bindings) {
            if (binding.syncMode === 'physicsToNode') {
                binding.syncNodeFromBody();
            }
        }

        return this;
    }

    public createDebugGraphics(options: RapierPhysicsDebugDrawOptions = {}): Graphics {
        const graphics = new Graphics();

        graphics.setCullable(false);
        this.updateDebugGraphics(graphics, options);

        return graphics;
    }

    public updateDebugGraphics(graphics: Graphics, options: RapierPhysicsDebugDrawOptions = {}): Graphics {
        const lineWidth = options.lineWidth ?? defaultDebugDrawOptions.lineWidth;
        const solidLineColor = options.solidLineColor ?? defaultDebugDrawOptions.solidLineColor;
        const solidFillColor = options.solidFillColor ?? defaultDebugDrawOptions.solidFillColor;
        const triggerLineColor = options.triggerLineColor ?? defaultDebugDrawOptions.triggerLineColor;
        const triggerFillColor = options.triggerFillColor ?? defaultDebugDrawOptions.triggerFillColor;

        graphics.clear();
        graphics.lineWidth = lineWidth;

        for (const binding of this._bindings) {
            const bodyTranslation = {
                x: binding.x,
                y: binding.y,
            };
            const rotation = binding.rotation;
            const lineColor = binding.trigger ? triggerLineColor : solidLineColor;
            const fillColor = binding.trigger ? triggerFillColor : solidFillColor;

            graphics.lineColor = lineColor;
            graphics.fillColor = fillColor;

            if (binding.shape.type === 'box') {
                const path = this.buildBoxPath(binding.shape, bodyTranslation.x, bodyTranslation.y, rotation);

                graphics.drawPolygon(path);
            } else {
                const offset = getOffset(binding.shape);
                const rotatedOffset = rotatePoint(offset.x, offset.y, rotation);

                graphics.drawCircle(
                    bodyTranslation.x + rotatedOffset.x,
                    bodyTranslation.y + rotatedOffset.y,
                    binding.shape.radius,
                );
            }
        }

        return graphics;
    }

    public destroy(): void {
        for (const binding of Array.from(this._bindings)) {
            this.removeBinding(binding);
        }

        this.onCollisionEnter.destroy();
        this.onCollisionExit.destroy();
        this.onTriggerEnter.destroy();
        this.onTriggerExit.destroy();
    }

    public writeBodyTransform(
        body: RapierRigidBodyLike,
        x: number,
        y: number,
        rotation: number,
        wakeUp: boolean,
    ): void {
        body.setTranslation(new this._rapier.vector2(x, y), wakeUp);
        body.setRotation(rotation, wakeUp);
    }

    public removeBinding(binding: RapierPhysicsBinding): void {
        if (!this._bindings.has(binding)) {
            return;
        }

        this._bindings.delete(binding);
        this._nodeBindings.delete(binding.node);
        this._colliderBindings.delete(binding.colliderHandle);
        this._world.removeRigidBody(binding.getBody());
    }

    private createBodyDescriptor(node: SceneNode, options: PhysicsBodyOptions): RapierRigidBodyDescLike {
        const type = options.type ?? 'dynamic';
        let descriptor: RapierRigidBodyDescLike = this._rapier.rigidBodyDescFactory.dynamic();

        switch (type) {
            case 'static':
                descriptor = this._rapier.rigidBodyDescFactory.fixed();
                break;
            case 'kinematic':
                if (typeof this._rapier.rigidBodyDescFactory.kinematicPositionBased === 'function') {
                    descriptor = this._rapier.rigidBodyDescFactory.kinematicPositionBased();
                } else if (typeof this._rapier.rigidBodyDescFactory.kinematicVelocityBased === 'function') {
                    descriptor = this._rapier.rigidBodyDescFactory.kinematicVelocityBased();
                } else {
                    throw new Error('Rapier module does not expose a kinematic rigid-body descriptor.');
                }
                break;
            default:
                descriptor = this._rapier.rigidBodyDescFactory.dynamic();
                break;
        }

        descriptor
            .setTranslation(node.x, node.y)
            .setRotation(node.rotation)
            .setLinearDamping(options.linearDamping ?? 0)
            .setAngularDamping(options.angularDamping ?? 0)
            .setGravityScale(options.gravityScale ?? 1)
            .lockRotations(options.lockRotation ?? false);

        return descriptor;
    }

    private createColliderDescriptor(options: PhysicsBodyOptions): RapierColliderDescLike {
        const shape = options.shape;
        const descriptor = shape.type === 'box'
            ? this._rapier.colliderDescFactory.cuboid(shape.width / 2, shape.height / 2)
            : this._rapier.colliderDescFactory.ball(shape.radius);
        const offset = getOffset(shape);
        const groups = toPackedCollisionGroups(options.collisionFilter);

        descriptor
            .setTranslation(offset.x, offset.y)
            .setRotation(shape.type === 'box' ? (shape.offsetRotation ?? 0) : 0)
            .setSensor(options.trigger ?? false)
            .setFriction(options.friction ?? 0.5)
            .setRestitution(options.restitution ?? 0)
            .setDensity(options.density ?? 1)
            .setCollisionGroups(groups)
            .setSolverGroups(groups);

        const collisionEvents = this._rapier.activeCollisionEvents;

        if (typeof collisionEvents === 'number') {
            descriptor.setActiveEvents(collisionEvents);
        }

        return descriptor;
    }

    private applyStepDelta(deltaSeconds: number): void {
        const worldWithTimestep = this._world as Partial<{
            timestep: number;
            integrationParameters: { dt: number; };
        }>;

        if (typeof worldWithTimestep.timestep === 'number') {
            worldWithTimestep.timestep = deltaSeconds;
        }

        if (
            worldWithTimestep.integrationParameters
            && typeof worldWithTimestep.integrationParameters.dt === 'number'
        ) {
            worldWithTimestep.integrationParameters.dt = deltaSeconds;
        }
    }

    private drainCollisionEvents(): void {
        this._eventQueue.drainCollisionEvents((handleA, handleB, started) => {
            const first = this._colliderBindings.get(handleA);
            const second = this._colliderBindings.get(handleB);

            if (!first || !second) {
                return;
            }

            const trigger = first.trigger || second.trigger;
            const event: RapierPhysicsEvent = {
                started,
                trigger,
                first,
                second,
            };

            if (trigger) {
                if (started) {
                    this.onTriggerEnter.dispatch(event);
                } else {
                    this.onTriggerExit.dispatch(event);
                }

                return;
            }

            if (started) {
                this.onCollisionEnter.dispatch(event);
            } else {
                this.onCollisionExit.dispatch(event);
            }
        });
    }

    private buildBoxPath(shape: PhysicsBoxShape, bodyX: number, bodyY: number, bodyRotation: number): Array<number> {
        const halfWidth = shape.width / 2;
        const halfHeight = shape.height / 2;
        const corners = [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight },
        ];
        const offset = getOffset(shape);
        const offsetRotation = shape.offsetRotation ?? 0;
        const path: Array<number> = [];

        for (const corner of corners) {
            const local = rotatePoint(corner.x, corner.y, offsetRotation);
            const withOffset = {
                x: local.x + offset.x,
                y: local.y + offset.y,
            };
            const worldPoint = rotatePoint(withOffset.x, withOffset.y, bodyRotation);

            path.push(bodyX + worldPoint.x, bodyY + worldPoint.y);
        }

        return path;
    }
}

export const createRapierPhysicsWorld = async (options: RapierPhysicsWorldOptions = {}): Promise<RapierPhysicsWorld> => {
    return await RapierPhysicsWorld.create(options);
};
