import { Asset } from '#assets/Asset';
import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { binarySourceCodec } from '#assets/AssetSourceCodec';
import type { AssetRequest } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';
import { type FontAssetOptions, FontFactory } from '#assets/factories/FontFactory';
import { parseBmFont } from '#assets/factories/parseBmFont';
import { FontAsset } from '#assets/tokens';
import { resolveSubAssetPath } from '#assets/utils';
import type { BmFontData, BmFontDistanceField } from '#rendering/text/BmFont';
import { BmFont } from '#rendering/text/BmFont';

/** Web fonts (WOFF, WOFF2, TTF, OTF) parsed into a loaded `FontFace`. */
export class FontAssetType extends AssetType<ArrayBuffer, FontFace, FontAssetOptions> {
  public readonly id = 'font';
  public override readonly extensions = ['woff', 'woff2', 'ttf', 'otf'];
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = FontAsset;
  public override readonly codec: AssetSourceCodec<ArrayBuffer> = binarySourceCodec;

  /** Family and CSS descriptors are baked into the face, so distinct interpretations are distinct resources. */
  public override resourceIdentity({ options }: AssetRequest<FontAssetOptions>): string {
    // Legacy font-loading implementations accept variant even when lib.dom omits it.
    const descriptors = options?.descriptors as (FontFaceDescriptors & { variant?: string }) | undefined;

    return JSON.stringify({
      family: options?.family,
      ascentOverride: descriptors?.ascentOverride,
      descentOverride: descriptors?.descentOverride,
      display: descriptors?.display,
      featureSettings: descriptors?.featureSettings,
      lineGapOverride: descriptors?.lineGapOverride,
      stretch: descriptors?.stretch,
      style: descriptors?.style,
      unicodeRange: descriptors?.unicodeRange,
      variant: descriptors?.variant,
      variationSettings: descriptors?.variationSettings,
      weight: descriptors?.weight,
    });
  }

  public createFactory(): AssetFactory<ArrayBuffer, FontFace, FontAssetOptions> {
    return new FontFactory();
  }
}

/** Options for loading an external BMFont descriptor. */
export interface BmFontAssetOptions {
  /**
   * Explicit encoding for exports with missing or different metadata. Replaces
   * the complete descriptor declaration for this request without changing
   * other consumers. Use `null` for an unknown range or zero value; no radius
   * is inferred. Declared SDF/MSDF/MTSDF pages decode as numeric data.
   */
  distanceField?: BmFontDistanceField;
}

/**
 * AngelCode BMFont text or BMFont JSON (including the symmetric distanceField
 * extension from msdf-bmfont-xml), together with their page textures. JSON must
 * be requested explicitly as `bmFont`; native msdf-atlas-gen JSON is not this
 * format. A compatible text `distanceField` tag is also accepted. Some text
 * exporters omit it; supply {@link BmFontAssetOptions.distanceField} then.
 *
 * The pages are claimed by the font's own dependency scope rather than by
 * whichever consumer asked for the font: a deduplicated font serves many
 * consumers, and the first of them to release it must not take the pages with
 * it.
 */
export class BmFontAssetType extends AssetType<BmFontData, BmFont, BmFontAssetOptions, string> {
  public readonly id = 'bmFont';
  public override readonly extensions = ['fnt'];
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = BmFont;
  public override readonly codec: AssetSourceCodec<BmFontData, string> = {
    fromResponse: response => response.text(),
    fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
    decode: stored => Promise.resolve(stored).then(parseBmFont),
  };

  /** Explicit interpretations share source bytes but have distinct font resources. */
  public override resourceIdentity({ options }: AssetRequest<BmFontAssetOptions>): string {
    const field = options?.distanceField;

    return field === undefined ? '' : JSON.stringify([field.fieldType, field.distanceRange, field.zeroDistanceValue]);
  }

  public createFactory(): AssetFactory<BmFontData, BmFont, BmFontAssetOptions> {
    return {
      async create(source, context) {
        const override = context.options?.distanceField;
        const data = override === undefined ? source : { ...source, distanceField: { ...override } };
        const fieldType = data.distanceField?.fieldType;
        const numeric = fieldType === 'sdf' || fieldType === 'msdf' || fieldType === 'mtsdf';
        const pages = await Promise.all(
          data.pages.map(page =>
            context.dependencies.load(
              Asset.type(
                'texture',
                resolveSubAssetPath(page, context.source),
                numeric ? { textureOptions: { colorSpace: 'none' } } : undefined,
              ),
            ),
          ),
        );

        return new BmFont(data, pages);
      },
    };
  }
}

/** The built-in `font` asset type. */
export const fontType = new FontAssetType();
/** The built-in `bmFont` asset type. */
export const bmFontType = new BmFontAssetType();
