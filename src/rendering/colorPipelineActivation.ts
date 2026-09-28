/**
 * Whether the engine's color-managed, linear-light rendering pipeline is
 * active. `false` until every renderer that authors or samples color has
 * been converted; flips once, engine-wide, rather than per resource.
 *
 * A renderer or backend author whose code authors its own color (a light, a
 * particle tint, a tile tint) reads this - or, where one is already at hand,
 * a `RenderBackend`'s `colorPipelineEnabled` - to choose between the legacy
 * authoring-byte path and the linear-light one, exactly as the engine's own
 * sprite/mesh/text draw stages do.
 */
export const COLOR_PIPELINE_ENABLED = false;
