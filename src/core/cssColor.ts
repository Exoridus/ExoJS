/**
 * The serialization every CSS engine produces for a color it has reduced to
 * sRGB channels: `rgb(r, g, b)` or `rgba(r, g, b, a)`, with the modern
 * space-and-slash spelling accepted as well.
 */
const RGB_FUNCTION = /^rgba?\((.+)\)$/i;

/** Split the argument list of an `rgb()`/`rgba()` serialization on either separator style. */
const splitComponents = (args: string): string[] => args.split(/[\s,/]+/).filter(part => part.length > 0);

const parseAlpha = (raw: string | undefined): number => {
  if (raw === undefined) return 1;

  const value = Number.parseFloat(raw);

  return raw.endsWith('%') ? value / 100 : value;
};

/** RGBA channels in the ranges {@link Color} stores them in: RGB 0..255, alpha 0..1. */
export interface CssColorChannels {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const parseRgbFunction = (serialized: string): CssColorChannels | null => {
  const match = RGB_FUNCTION.exec(serialized.trim());

  if (match === null) return null;

  const components = splitComponents(match[1]!);

  if (components.length < 3 || components.length > 4) return null;

  const [r, g, b] = components;
  const channels = { r: Number.parseFloat(r!), g: Number.parseFloat(g!), b: Number.parseFloat(b!), a: parseAlpha(components[3]) };

  return Number.isNaN(channels.r) || Number.isNaN(channels.g) || Number.isNaN(channels.b) || Number.isNaN(channels.a) ? null : channels;
};

/**
 * Scratch element the round trip runs on. Reused across calls and never part of
 * the document except for the moment a keyword has to be resolved.
 */
let probe: HTMLElement | null = null;

const getProbe = (): HTMLElement => {
  if (typeof document === 'undefined') {
    throw new Error('Color: fromCss needs the runtime CSS parser, which is only reachable from a document - there is none here (a worker, or a non-DOM host).');
  }

  if (probe === null) {
    probe = document.createElement('span');
    // Keeps the element out of layout for the moment it spends in the document
    // resolving a keyword; `color` resolves regardless of display.
    probe.style.display = 'none';
  }

  return probe;
};

/**
 * Resolve the value the CSS engine computes for `value`, for the case where it
 * kept the specified value verbatim (a color keyword, or a syntax it serializes
 * unchanged). Needs the element in the document, so it is only reached when the
 * inline round trip alone did not answer.
 */
const resolveComputed = (element: HTMLElement): string => {
  const parent = document.body ?? document.documentElement;

  parent.append(element);

  try {
    return getComputedStyle(element).color;
  } finally {
    element.remove();
  }
};

/**
 * Resolve any CSS color the runtime understands to sRGB channels, by handing
 * the value to the engine's own parser rather than reimplementing it.
 *
 * Throws when the value is not a color the runtime accepts, and when it accepts
 * it but serializes it in a space this cannot read back.
 * @internal
 */
export const resolveCssColor = (value: string): CssColorChannels => {
  const element = getProbe();

  element.style.color = '';
  element.style.color = value;

  const specified = element.style.color;

  if (specified === '') {
    throw new Error(`Color: "${value}" is not a CSS color the runtime accepts.`);
  }

  const direct = parseRgbFunction(specified);

  if (direct !== null) return direct;

  const computed = parseRgbFunction(resolveComputed(element));

  if (computed !== null) return computed;

  throw new Error(`Color: the runtime accepts "${value}" but resolves it outside sRGB; convert it to a hex, rgb() or hsl() value first.`);
};
