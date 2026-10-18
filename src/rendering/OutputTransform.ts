import type { Color } from '#core/Color';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import { WebGl2OutputPass } from '#rendering/webgl2/WebGl2OutputPass';
import { WebGpuOutputPass } from '#rendering/webgpu/WebGpuOutputPass';

/** HDR-to-SDR mapping applied after exposure, ahead of the sRGB output encode. */
export type OutputToneMapping = 'none' | 'reinhard';

/**
 * The internal storage the scene renders into before the output transform.
 * `'sdr'` (the default) is the existing eight-bit `Rgba8Srgb` working target.
 * `'hdr'` allocates an `Rgba16F` working target instead, so a value above
 * display white survives every intermediate pass instead of clamping before
 * the tone map ever sees it - it does not change the output transform's own
 * math, which already operates on unbounded linear input.
 */
export type WorkingColorFormat = 'sdr' | 'hdr';

/**
 * The application's output transform - the mandatory step every frame passes
 * through exactly once, whatever else ran before it. See
 * {@link RenderingApplicationOptions.color}.
 */
export interface OutputTransformOptions {
  /**
   * Internal working storage for the scene and its frame passes. Default `'sdr'`.
   * Requesting `'hdr'` on a backend without `Rgba16F` render-target support
   * throws during initialization, before the first frame draws.
   */
  workingFormat?: WorkingColorFormat;
  /**
   * Exposure applied before the tone-map and sRGB encode, in stops - the
   * working color is scaled by `2 ** exposure`. Must be finite and within
   * `[-32, 32]`. Default `0`.
   */
  exposure?: number;
  /**
   * HDR-to-SDR mapping applied after exposure. `'none'` clamps at SDR white
   * (`1.0`); `'reinhard'` is the per-channel positive-value operator
   * `x / (1 + x)`. Never applied to alpha. Default `'none'`.
   */
  toneMapping?: OutputToneMapping;
}

/** {@link OutputTransformOptions}, fully resolved and validated. @internal */
export interface ResolvedOutputTransformOptions {
  readonly workingFormat: WorkingColorFormat;
  readonly exposure: number;
  readonly toneMapping: OutputToneMapping;
}

const minExposureStops = -32;
const maxExposureStops = 32;

/**
 * Resolve and validate {@link OutputTransformOptions} against their defaults.
 * Throws on a non-finite/out-of-range exposure or an unrecognised tone
 * mapping or working format. Capability (whether the backend actually
 * supports `Rgba16F` rendering) is checked separately once a backend exists -
 * see `Application`'s post-initialize validation.
 * @internal
 */
export const resolveOutputTransformOptions = (options: OutputTransformOptions = {}): ResolvedOutputTransformOptions => {
  const workingFormat = options.workingFormat ?? 'sdr';

  if (workingFormat !== 'sdr' && workingFormat !== 'hdr') {
    throw new Error(`rendering.color.workingFormat must be 'sdr' or 'hdr', got '${workingFormat as string}'.`);
  }

  const exposure = options.exposure ?? 0;

  if (!Number.isFinite(exposure) || exposure < minExposureStops || exposure > maxExposureStops) {
    throw new Error(
      `rendering.color.exposure must be a finite number within [${minExposureStops}, ${maxExposureStops}] stops, got ${exposure}.`,
    );
  }

  const toneMapping = options.toneMapping ?? 'none';

  if (toneMapping !== 'none' && toneMapping !== 'reinhard') {
    throw new Error(`rendering.color.toneMapping must be 'none' or 'reinhard', got '${toneMapping as string}'.`);
  }

  return { workingFormat, exposure, toneMapping };
};

/** The color-managed working target's storage format for a resolved `workingFormat`. @internal */
export const workingColorTextureFormat = (workingFormat: WorkingColorFormat): TextureFormat.Rgba8Srgb | TextureFormat.Rgba16F =>
  workingFormat === 'hdr' ? TextureFormat.Rgba16F : TextureFormat.Rgba8Srgb;

/**
 * Fail fast on an `'hdr'` working format the given backend cannot actually
 * render into, rather than falling back to SDR storage or failing later
 * inside the first frame's draw. A no-op under `'sdr'`.
 * @internal
 */
export const validateWorkingColorFormatSupport = (backend: RenderBackend, workingFormat: WorkingColorFormat): void => {
  if (workingFormat === 'hdr' && !backend.supportsColorFormat(TextureFormat.Rgba16F)) {
    throw new Error("rendering.color.workingFormat: 'hdr' requires Rgba16F render-target support, which this backend does not have.");
  }
};

/** A linear-light RGBA sample, premultiplied by alpha. */
export interface LinearPremultipliedSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** A resolved sRGB-encoded, canvas-ready RGBA sample. */
export interface EncodedOutputSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const srgbEncodeChannel = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

// Values beyond this magnitude saturate at the SDR/tone-map ceiling instead of
// reaching an actual floating-point infinity, which would turn the reinhard
// division into NaN. Matches the GPU shaders' own `outputHuge` constant.
const outputHuge = 3e38;

const sanitizeChannel = (value: number): number => (Number.isNaN(value) ? 0 : Math.min(Math.max(value, 0), outputHuge));

const mapChannel = (exposed: number, toneMapping: OutputToneMapping): number =>
  toneMapping === 'reinhard' ? exposed / (1 + exposed) : Math.min(exposed, 1);

/**
 * The pure CPU reference for D3's output transform: exposure, the HDR-to-SDR
 * mapping and the sRGB encode, applied to one linear-PMA `sample` per the
 * transparent/opaque alpha rule. Mirrors `output.frag`/`output.wgsl` exactly
 * and exists so the transform's numeric contract is testable without a GPU.
 *
 * For a transparent target this computes `E(C/a)*a` (unassociate, transform,
 * re-associate), collapsing to `0` at `a = 0` rather than dividing by it. For
 * an opaque target the linear PMA color is first composited over `matte`
 * (`C + (1-a)*matte`) before the transform runs, and the result carries
 * alpha `1` - a partially covered pixel is never unassociated and thereby
 * brightened.
 * @internal
 */
export const applyOutputTransform = (
  sample: LinearPremultipliedSample,
  options: ResolvedOutputTransformOptions,
  transparent: boolean,
  matte: LinearPremultipliedSample,
): EncodedOutputSample => {
  if (transparent && sample.a <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const scale = 2 ** options.exposure;

  const straightR = transparent ? sample.r / sample.a : sample.r + (1 - sample.a) * matte.r;
  const straightG = transparent ? sample.g / sample.a : sample.g + (1 - sample.a) * matte.g;
  const straightB = transparent ? sample.b / sample.a : sample.b + (1 - sample.a) * matte.b;
  const outAlpha = transparent ? sample.a : 1;

  const r = srgbEncodeChannel(mapChannel(sanitizeChannel(straightR * scale), options.toneMapping));
  const g = srgbEncodeChannel(mapChannel(sanitizeChannel(straightG * scale), options.toneMapping));
  const b = srgbEncodeChannel(mapChannel(sanitizeChannel(straightB * scale), options.toneMapping));

  return transparent ? { r: r * outAlpha, g: g * outAlpha, b: b * outAlpha, a: outAlpha } : { r, g, b, a: outAlpha };
};

/**
 * The mandatory final step of every application frame: composites the linear
 * premultiplied working image against the canvas's alpha contract (D3) and
 * encodes it to the sRGB UNORM canvas exactly once, whatever ran before it -
 * the direct-draw path and a `framePasses` chain alike.
 *
 * Dispatches to a backend-specific {@link WebGl2OutputPass} / {@link WebGpuOutputPass},
 * each built lazily on first use against the live backend and reused for the
 * life of this instance.
 * @internal
 */
export class OutputTransform {
  private _options: ResolvedOutputTransformOptions;
  private _webgl2Pass: WebGl2OutputPass | null = null;
  private _webgpuPass: WebGpuOutputPass | null = null;

  public constructor(options: OutputTransformOptions = {}) {
    this._options = resolveOutputTransformOptions(options);
  }

  /**
   * Replace the resolved exposure/tone-mapping, validating them the same way
   * the constructor does. `workingFormat` is fixed at construction - the
   * working target's own allocation already happened by the time this runs,
   * so a later change here would silently stop matching the real storage.
   */
  public setOptions(options: OutputTransformOptions): void {
    this._options = resolveOutputTransformOptions({ ...options, workingFormat: this._options.workingFormat });
  }

  /**
   * Sample the linear-PMA `source` and write the sRGB-encoded, canvas-ready
   * result to `target`, or the canvas when omitted (the per-frame path).
   * `transparent` selects the D3 alpha rule; `matte` is the clear color
   * composited under an opaque result. `straightAlpha` leaves a transparent
   * result unassociated (the layout `ImageData` expects) instead of
   * premultiplied like a canvas.
   */
  public present(
    backend: RenderBackend,
    source: RenderTexture,
    transparent: boolean,
    matte: Color,
    target?: RenderTexture,
    straightAlpha = false,
  ): void {
    if (backend.backendType === RenderBackendType.WebGpu) {
      (this._webgpuPass ??= new WebGpuOutputPass()).present(backend, source, this._options, transparent, matte, target, straightAlpha);

      return;
    }

    (this._webgl2Pass ??= new WebGl2OutputPass()).present(backend, source, this._options, transparent, matte, target, straightAlpha);
  }

  public destroy(): void {
    this._webgl2Pass?.destroy();
    this._webgpuPass?.destroy();
    this._webgl2Pass = null;
    this._webgpuPass = null;
  }
}
