/**
 * Largest grid the view-sized fields are built on, per axis.
 *
 * The occluder mask and the block level reduced from it cover the camera's
 * view plus its margin, so their size follows the surface rather than the
 * scene. Bounding it is what keeps that cost flat: a 1080p view with the
 * default margin already asks for 2880x1620 texels, and a 4K one for four
 * times as many. Beyond the bound the mask is simply coarser than the screen,
 * which is a quality the caller can see and a cost that stays where it is.
 * @internal
 */
export const MAX_FIELD_TEXELS = 2048;

/**
 * The grid a field of this requested size is actually built on: the same
 * aspect, scaled down to fit {@link MAX_FIELD_TEXELS} on both axes.
 * @internal
 */
export const fieldGrid = (width: number, height: number): { width: number; height: number } => {
  const scale = Math.min(1, MAX_FIELD_TEXELS / Math.max(1, width, height));

  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
};
