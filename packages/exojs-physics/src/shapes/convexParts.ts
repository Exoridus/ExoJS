import type { PointLike } from '@codexo/exojs';

import { decomposeToConvexParts } from './decompose';
import { PolygonShape } from './PolygonShape';

/**
 * Turn one possibly-concave outline into the convex solver shapes that
 * represent it. Attach all of them to a single body: together they are the
 * original area, and a `PolygonShape` stays exactly one convex shape rather
 * than secretly standing for several.
 *
 * The number of shapes and their order follow from the current decomposition
 * and are not a stable contract; the preserved properties are the area, the
 * centre of mass and the rotational inertia of the compound.
 *
 * @throws RangeError on a non-finite coordinate, on fewer than three distinct
 * non-collinear vertices, on a self-intersecting outline, or when a part comes
 * out too degenerate for {@link PolygonShape}.
 * @internal
 */
export const toConvexPolygonShapes = (vertices: ReadonlyArray<Readonly<PointLike>>): PolygonShape[] => decomposeToConvexParts(vertices).map(part => new PolygonShape(part));
