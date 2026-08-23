import type { CapsuleShape } from './CapsuleShape';
import type { CircleShape } from './CircleShape';
import type { PolygonShape } from './PolygonShape';
import type { SegmentShape } from './SegmentShape';

/**
 * Discriminated union of the concrete shape kinds. Narrow via the literal
 * `shape.type` discriminant (`'circle'` → {@link CircleShape}, `'capsule'` →
 * {@link CapsuleShape}, `'polygon'` → {@link PolygonShape}) - no `as` casts
 * needed. {@link BoxShape} is a {@link PolygonShape} subclass and carries
 * `type: 'polygon'`.
 */
export type AnyShape = CapsuleShape | CircleShape | PolygonShape | SegmentShape;
