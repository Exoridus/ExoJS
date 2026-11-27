import type { CapsuleShape } from './CapsuleShape';
import type { ChainShape } from './ChainShape';
import type { CircleShape } from './CircleShape';
import type { PolygonShape } from './PolygonShape';
import type { SegmentShape } from './SegmentShape';

/**
 * Discriminated union of the concrete shape kinds. Narrow via the literal
 * `shape.type` discriminant: `'circle'` is a {@link CircleShape}, `'capsule'` a
 * {@link CapsuleShape}, `'polygon'` a {@link PolygonShape}, `'segment'` a
 * {@link SegmentShape} and `'chain'` a {@link ChainShape} - no `as` casts are
 * needed. {@link BoxShape} is a {@link PolygonShape} subclass and carries
 * `type: 'polygon'`.
 */
export type AnyShape = CapsuleShape | ChainShape | CircleShape | PolygonShape | SegmentShape;
