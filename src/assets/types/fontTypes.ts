import { Asset } from '#assets/Asset';
import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { binarySourceCodec } from '#assets/AssetSourceCodec';
import type { AssetRequest } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';
import { type FontAssetOptions, FontFactory } from '#assets/factories/FontFactory';
import { parseBmFontText } from '#assets/factories/parseBmFont';
import { FontAsset } from '#assets/tokens';
import { resolveSubAssetPath } from '#assets/utils';
import type { BmFontData } from '#rendering/text/BmFont';
import { BmFont } from '#rendering/text/BmFont';

/** Web fonts (WOFF, WOFF2, TTF, OTF) parsed into a loaded `FontFace`. */
export class FontAssetType extends AssetType<ArrayBuffer, FontFace, FontAssetOptions> {
  public readonly id = 'font';
  public override readonly extensions = ['woff', 'woff2', 'ttf', 'otf'];
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = FontAsset;
  public override readonly codec: AssetSourceCodec<ArrayBuffer> = binarySourceCodec;

  /** The family name is baked into the face, so one file registered under two families is two resources. */
  public override resourceIdentity({ options }: AssetRequest<FontAssetOptions>): string {
    return options?.family === undefined ? '' : `family=${options.family}`;
  }

  public createFactory(): AssetFactory<ArrayBuffer, FontFace, FontAssetOptions> {
    return new FontFactory();
  }
}

/**
 * AngelCode BMFont descriptors (`.fnt`, text format) together with their page
 * textures.
 *
 * The pages are claimed by the font's own dependency scope rather than by
 * whichever consumer asked for the font: a deduplicated font serves many
 * consumers, and the first of them to release it must not take the pages with
 * it.
 */
export class BmFontAssetType extends AssetType<BmFontData, BmFont, undefined, string> {
  public readonly id = 'bmFont';
  public override readonly extensions = ['fnt'];
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = BmFont;
  public override readonly codec: AssetSourceCodec<BmFontData, string> = {
    fromResponse: response => response.text(),
    fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
    decode: stored => Promise.resolve(parseBmFontText(stored)),
  };

  public createFactory(): AssetFactory<BmFontData, BmFont> {
    return {
      async create(source, context) {
        const pages = await Promise.all(source.pages.map(page => context.dependencies.load(Asset.type('texture', resolveSubAssetPath(page, context.source)))));

        return new BmFont(source, pages);
      },
    };
  }
}

/** The built-in `font` asset type. */
export const fontType = new FontAssetType();
/** The built-in `bmFont` asset type. */
export const bmFontType = new BmFontAssetType();
