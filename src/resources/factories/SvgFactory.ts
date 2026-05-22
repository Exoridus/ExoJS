import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/** Construction options for {@link SvgFactory.create}. */
export interface SvgFactoryOptions {
  /**
   * Target render width in pixels. When provided, the value is injected into
   * the root `<svg>` element's `width` attribute before the browser rasterises
   * the image, overriding any intrinsic width declared in the file.
   *
   * SVGs that carry only a `viewBox` (no `width`/`height` attributes) render
   * as a 0×0 image by default; supplying `width` and `height` here fixes that.
   */
  width?: number;
  /** Target render height in pixels. See {@link width}. */
  height?: number;
}

/**
 * {@link AssetFactory} implementation that loads SVG markup and produces a
 * rasterised {@link HTMLImageElement}.
 *
 * The SVG source text is wrapped in an `image/svg+xml` blob and decoded by the
 * browser's image pipeline, which means the result is a bitmap snapshot at the
 * element's intrinsic size rather than a live, interactive SVG DOM. Use this
 * when you need an SVG as a static sprite or texture source.
 */
export class SvgFactory extends AbstractAssetFactory<HTMLImageElement> {
  public readonly storageName = 'svg';

  /**
   * Reads the response body as UTF-8 text containing the raw SVG markup.
   */
  public async process(response: Response): Promise<string> {
    return response.text();
  }

  /**
   * Renders the SVG markup into a fully loaded {@link HTMLImageElement}.
   *
   * When `options.width` or `options.height` are provided, the values are
   * injected into the root `<svg>` element before rasterisation so the browser
   * renders at the requested pixel dimensions rather than the intrinsic size.
   * Creates a temporary `image/svg+xml` object URL, assigns it to an `<img>`
   * element, and revokes the URL once loading settles. Rejects on load error
   * or abort.
   */
  public async create(source: string, options: SvgFactoryOptions = {}): Promise<HTMLImageElement> {
    const { width, height } = options;
    let svgSource = source;

    if (width !== undefined || height !== undefined) {
      svgSource = source.replace(
        /<svg(\s[^>]*)?>/,
        (_match: string, attrs = '') => {
          const cleaned = String(attrs)
            .replaceAll(/\s+width=(?:"[^"]*"|'[^']*')/g, '')
            .replaceAll(/\s+height=(?:"[^"]*"|'[^']*')/g, '');
          const additions = (width !== undefined ? ` width="${width}"` : '')
            + (height !== undefined ? ` height="${height}"` : '');
          return `<svg${cleaned}${additions}>`;
        },
      );
    }

    const blob = new Blob([svgSource], { type: 'image/svg+xml' });
    const objectUrl = this.createObjectUrl(blob);

    return new Promise((resolve, reject) => {
      const image = new Image();
      const finalize = (): void => {
        this.revokeObjectUrl(objectUrl);
      };

      image.addEventListener(
        'load',
        () => {
          finalize();
          resolve(image);
        },
        { once: true },
      );
      image.addEventListener(
        'error',
        () => {
          finalize();
          reject(new Error('Error loading image source.'));
        },
        { once: true },
      );
      image.addEventListener(
        'abort',
        () => {
          finalize();
          reject(new Error('Image loading was canceled.'));
        },
        { once: true },
      );

      image.src = objectUrl;
    });
  }
}
