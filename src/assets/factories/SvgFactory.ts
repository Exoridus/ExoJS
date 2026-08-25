import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';

import { ObjectUrlPool } from './ObjectUrlPool';

/** Options accepted by an asset of the built-in `svg` type. */
export interface SvgAssetOptions {
  /**
   * Render width in pixels, written into the root `<svg>` element before the
   * browser rasterises it.
   *
   * A file carrying only a `viewBox` has no intrinsic size and rasterises as a
   * 0x0 image; giving it a width and height here is what fixes that.
   */
  width?: number;
  /** Render height in pixels. See {@link width}. */
  height?: number;
}

const SVG_OPEN_TAG = '<svg';

/** Replaces the root element's own width/height with the requested ones. */
const resize = (markup: string, width: number | undefined, height: number | undefined): string => {
  const start = markup.indexOf(SVG_OPEN_TAG);
  const tagEnd = start === -1 ? -1 : markup.indexOf('>', start);

  if (start === -1 || tagEnd === -1) {
    return markup;
  }

  const attributes = markup
    .slice(start + SVG_OPEN_TAG.length, tagEnd)
    .replaceAll(/\s+width=(?:"[^"]*"|'[^']*')/g, '')
    .replaceAll(/\s+height=(?:"[^"]*"|'[^']*')/g, '');
  const requested = (width === undefined ? '' : ` width="${width}"`) + (height === undefined ? '' : ` height="${height}"`);

  return `${markup.slice(0, start)}${SVG_OPEN_TAG}${attributes}${requested}>${markup.slice(tagEnd + 1)}`;
};

/**
 * Rasterises SVG markup into an {@link HTMLImageElement}.
 *
 * The result is a bitmap snapshot decoded by the browser's image pipeline, not
 * a live SVG DOM: it is a sprite or texture source, and nothing in it can be
 * scripted or restyled afterwards.
 * @internal
 */
export class SvgFactory implements AssetFactory<string, HTMLImageElement, SvgAssetOptions> {
  private readonly _objectUrls = new ObjectUrlPool();

  public create(source: string, context: AssetFactoryContext<SvgAssetOptions>): Promise<HTMLImageElement> {
    const { width, height } = context.options ?? {};
    const markup = width === undefined && height === undefined ? source : resize(source, width, height);
    const objectUrl = this._objectUrls.create(new Blob([markup], { type: 'image/svg+xml' }));

    return new Promise((resolve, reject) => {
      const image = new Image();
      const settle = (finish: () => void): void => {
        this._objectUrls.revoke(objectUrl);
        finish();
      };

      image.addEventListener('load', () => settle(() => resolve(image)), { once: true });
      image.addEventListener(
        'error',
        () =>
          settle(() => reject(new Error('Failed to decode SVG source - the markup may be malformed, or (if loaded as the wrong asset type) not SVG at all.'))),
        { once: true },
      );
      image.addEventListener('abort', () => settle(() => reject(new Error('Image loading was canceled.'))), { once: true });

      image.src = objectUrl;
    });
  }

  public destroy(): void {
    this._objectUrls.revokeAll();
  }
}
