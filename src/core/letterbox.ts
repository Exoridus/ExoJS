/**
 * Geometry for the `'letterbox'` canvas sizing mode. Pure math, split out from
 * {@link Application} so it can be unit-tested without a render backend.
 * @internal
 */

/** Result of fitting a fixed design space into a parent for letterbox sizing. @internal */
export interface LetterboxLayout {
  /** CSS width of the centered canvas — the design-aspect content area. */
  contentWidthCss: number;
  /** CSS height of the centered canvas. */
  contentHeightCss: number;
  /** Backing-store width (`content × pixelRatio`) — the crisp native resolution. */
  backingWidth: number;
  /** Backing-store height. */
  backingHeight: number;
}

/**
 * Fit a `designWidth × designHeight` space into a parent of the given CSS size,
 * preserving aspect ratio (letterbox — never crop, never stretch). Returns the
 * centered content rectangle's CSS size and its native backing-store size at
 * `pixelRatio`. The larger axis of the parent becomes the bars.
 * @internal
 */
export const computeLetterboxLayout = (
  parentWidthCss: number,
  parentHeightCss: number,
  designWidth: number,
  designHeight: number,
  pixelRatio: number,
): LetterboxLayout => {
  const scale = Math.min(parentWidthCss / designWidth, parentHeightCss / designHeight);
  const contentWidthCss = designWidth * scale;
  const contentHeightCss = designHeight * scale;

  return {
    contentWidthCss,
    contentHeightCss,
    backingWidth: Math.max(1, Math.round(contentWidthCss * pixelRatio)),
    backingHeight: Math.max(1, Math.round(contentHeightCss * pixelRatio)),
  };
};
