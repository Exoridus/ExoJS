/**
 * The one place the canvas text state is configured.
 *
 * Measurement and rasterization have to agree bit for bit about the font, the
 * baseline, the base direction and the letter spacing, or a contextually
 * shaped line would be measured as one string and drawn as another. Both sides
 * go through {@link applyCanvasTextState} rather than reconstructing the state
 * themselves.
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The complete text state a canvas needs to measure or draw one string. */
export interface CanvasTextState {
  /** CSS `font` shorthand. */
  readonly font: string;
  /** Base direction the canvas resolves bidi order and contextual forms against. */
  readonly direction: 'ltr' | 'rtl';
  /** Extra spacing in pixels between characters; `0` leaves the font's own advances alone. */
  readonly letterSpacing: number;
}

/**
 * Whether `ctx` honours `letterSpacing`.
 *
 * Where it does not, spacing cannot be applied to a contextually shaped line
 * at all - inserting it between characters would break the joining the shaping
 * exists to produce - and the line is drawn with the font's own advances.
 */
export const canvasSupportsLetterSpacing = (ctx: Ctx2D): boolean => 'letterSpacing' in ctx;

/**
 * Apply `state` to `ctx`, leaving it ready for `measureText` or `fillText`.
 *
 * `textAlign` is pinned to the physical left edge rather than left at the
 * direction-relative default, so a right-to-left string still starts at the
 * anchor and its raster tile maps onto the layout box the same way in both
 * directions. Reapply after any canvas resize: assigning `canvas.width` or
 * `canvas.height` resets the 2D context to its defaults.
 */
export const applyCanvasTextState = (ctx: Ctx2D, state: CanvasTextState): void => {
  ctx.font = state.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.direction = state.direction;

  if (canvasSupportsLetterSpacing(ctx)) {
    (ctx as CanvasRenderingContext2D).letterSpacing = state.letterSpacing === 0 ? '0px' : `${state.letterSpacing}px`;
  }
};
