// Side-effect-free public API for @codexo/exojs-physics.
// Importing this entry performs no registration — physics is a peer-dependency
// library, constructed directly (`new PhysicsWorld(...)`), not an Application
// extension. The tree-shakeable debug overlay lives at `@codexo/exojs-physics/debug`.

export type { Aabb } from './Aabb';
export type { BindingOptions } from './binding/PhysicsBinding';
export { PhysicsBinding } from './binding/PhysicsBinding';
export type { ColliderOptions } from './Collider';
export { Collider } from './Collider';
export type { CollisionEvent, ContactPoint, SensorEvent } from './events';
export { DistanceJoint, type DistanceJointOptions } from './joints/DistanceJoint';
export { Joint } from './joints/Joint';
export { MouseJoint, type MouseJointOptions } from './joints/MouseJoint';
export { PrismaticJoint, type PrismaticJointOptions } from './joints/PrismaticJoint';
export { RevoluteJoint, type RevoluteJointOptions } from './joints/RevoluteJoint';
export { WeldJoint, type WeldJointOptions } from './joints/WeldJoint';
export { WheelJoint, type WheelJointOptions } from './joints/WheelJoint';
export type { BodyOptions } from './PhysicsBody';
export { PhysicsBody } from './PhysicsBody';
export { type PhysicsBuildInfo,physicsBuildInfo } from './physicsBuildInfo';
export type { AttachOptions, PhysicsWorldOptions } from './PhysicsWorld';
export { PhysicsWorld } from './PhysicsWorld';
export type { QueryFilter, RayHit } from './query/QueryEngine';
export type { AnyShape } from './shapes/AnyShape';
export { BoxShape } from './shapes/BoxShape';
export { CircleShape } from './shapes/CircleShape';
export { PolygonShape } from './shapes/PolygonShape';
export type { ShapeType } from './shapes/Shape';
export { Shape } from './shapes/Shape';
export type { TimeStepperOptions } from './TimeStepper';
export { TimeStepper } from './TimeStepper';
export type { BodyType, CollisionFilter, VectorLike } from './types';
export { defaultFilter, shouldCollide } from './types';
