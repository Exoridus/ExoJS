import type { TextEffect, TextEffectFailureReason, TextEffectIssue } from './textEffects';

/**
 * Raised when a text node cannot draw a requested outline or shadow.
 *
 * Thrown synchronously by the operation that would create the unsupported
 * combination - constructing the node, assigning or mutating its style,
 * swapping its font or font scale, or reading a serialized document - and that
 * operation leaves every object unchanged. The renderer never throws it.
 *
 * Callers branch on {@link reason}: `'insufficient-effect-capacity'` is fixed by
 * a smaller effect or a node built with more capacity (`Text` `sdfRadius`), the
 * other reasons by a font that carries usable distance-field metadata.
 * {@link AbstractText.checkEffects} answers the same question without throwing.
 */
export class TextEffectError extends Error implements TextEffectIssue {
  public readonly reason: TextEffectFailureReason;
  public readonly effect: TextEffect;
  public readonly required: number;
  public readonly available: number;

  public constructor(issue: TextEffectIssue, context?: string) {
    super(describeTextEffectIssue(issue, context));

    this.name = 'TextEffectError';
    this.reason = issue.reason;
    this.effect = issue.effect;
    this.required = issue.required;
    this.available = issue.available;
  }
}

const reasonText = (reason: TextEffectFailureReason): string => {
  switch (reason) {
    case 'no-distance-field':
      return 'the glyphs carry no distance field (color glyphs or a plain bitmap font)';
    case 'unknown-range':
      return 'the font does not declare its distance range, zero value and padding';
    case 'invalid-range':
      return 'the font declares an unusable distance range, zero value or padding';
    case 'insufficient-effect-capacity':
      return 'the request exceeds the distance-field capacity';
  }
};

const describeTextEffectIssue = (issue: TextEffectIssue, context: string | undefined): string => {
  const prefix = context === undefined ? '' : `${context}: `;
  const amounts =
    issue.reason === 'insufficient-effect-capacity'
      ? ` (needs ${formatPx(issue.required)} logical px including the antialiasing reserve, has ${formatPx(issue.available)})`
      : '';

  return `${prefix}cannot draw the text ${issue.effect}: ${reasonText(issue.reason)}${amounts}.`;
};

const formatPx = (value: number): string => (Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : String(value));
