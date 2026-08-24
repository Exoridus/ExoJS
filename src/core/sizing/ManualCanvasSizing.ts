import { CanvasSizing, type CanvasSizingContext } from './CanvasSizing';

/**
 * Hands the canvas geometry to whoever is hosting it.
 *
 * Nothing is observed, no CSS is written and no size ever changes on its own.
 * The application starts at the base resolution - the logical coordinate system
 * and the backing store are `width x height` and `width x height x pixelRatio`,
 * the CSS box is left exactly as the page set it - and stays there until the
 * host calls {@link Application.resize}, which moves both of them together and
 * still leaves the CSS box alone.
 *
 * The mode for a canvas whose size is decided elsewhere: a framework-managed
 * layout, an editor panel, or a worker-hosted surface whose dimensions arrive
 * over a message channel.
 *
 * Distinct from passing no sizing at all, which is the same starting geometry
 * but with the application owning the CSS box and keeping it at the base
 * resolution.
 */
export class ManualCanvasSizing extends CanvasSizing {
  public attach(_context: CanvasSizingContext): void {}
}
