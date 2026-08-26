import { Filter, type ReadonlyRectangle, type Rectangle } from '@codexo/exojs';

// #region guide:custom-filter
class GlowFilter extends Filter {
  public constructor(public spread: number) {
    super();
  }

  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    output.set(input.x - this.spread, input.y - this.spread, input.width + this.spread * 2, input.height + this.spread * 2);
  }

  public apply(): void {
    // ...the glow passes
  }
}
// #endregion guide:custom-filter

export { GlowFilter };
