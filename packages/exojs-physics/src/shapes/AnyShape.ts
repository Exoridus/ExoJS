import type { CircleShape } from './CircleShape';
import type { PolygonShape } from './PolygonShape';

/**
 * Discriminated union of the concrete shape kinds. Narrow via the literal
 * `shape.type` discriminant (`'circle'` → {@link CircleShape}, `'polygon'` →
 * {@link PolygonShape}) — no `as` casts needed. {@link BoxShape} is a
 * {@link PolygonShape} subclass and carries `type: 'polygon'`.
 */
export type AnyShape = CircleShape | PolygonShape;
