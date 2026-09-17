import type { ReadonlyRectangle, Texture } from '@codexo/exojs';

/**
 * The scratch surface every read borrows.
 *
 * A 2D context is the only way to get at the pixels of an `HTMLImageElement`,
 * an `ImageBitmap` or a video frame - the platform exposes no other readback -
 * but creating one per call is not. Loading a hundred props would otherwise
 * mean a hundred canvases and a hundred contexts; they share this one instead,
 * which is safe because a read is synchronous from first pixel to last.
 */
let scratch: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null;

/**
 * Borrow the scratch surface at `width` by `height`.
 *
 * Assigning the size resets the drawing surface, so each read starts on a
 * cleared canvas and never sees the tail of a larger predecessor.
 */
const borrow = (width: number, height: number): CanvasRenderingContext2D | null => {
  if (scratch === null) {
    const canvas = document.createElement('canvas');
    // `willReadFrequently` asks the browser to keep the backing store on the
    // CPU, which is the whole access pattern here: draw once, read once.
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (context === null) {
      return null;
    }

    scratch = { canvas, context };
  }

  scratch.canvas.width = width;
  scratch.canvas.height = height;

  return scratch.context;
};

/** Give the backing store back. A traced atlas page would otherwise stay resident for the session. */
const release = (): void => {
  if (scratch !== null) {
    scratch.canvas.width = 1;
    scratch.canvas.height = 1;
  }
};

/**
 * A texture's alpha channel as `0..1` per pixel in row-major order, or `null`
 * when the source cannot be read.
 *
 * Needs a browser canvas, so it is kept apart from everything that consumes
 * it: the arithmetic over an alpha field - derived normals, traced outlines -
 * stays checkable without a GPU or a DOM.
 *
 * `region` restricts the read to part of the texture - an atlas frame - and is
 * scaled onto `width` by `height`; omitting it reads the whole texture.
 *
 * A texture that is still loading, backed by nothing drawable, or tainted by a
 * cross-origin image reads as `null` rather than throwing: the silhouette is
 * unknowable, and the caller decides what that means.
 * @internal
 */
export const readAlphaField = (texture: Texture, width: number, height: number, region?: ReadonlyRectangle): Float32Array | null => {
  const source = texture.source;

  if (source === null || typeof document === 'undefined') {
    return null;
  }

  const context = borrow(width, height);

  if (context === null) {
    return null;
  }

  try {
    if (region === undefined) {
      context.drawImage(source, 0, 0, width, height);
    } else {
      context.drawImage(source, region.left, region.top, region.width, region.height, 0, 0, width, height);
    }

    const pixels = context.getImageData(0, 0, width, height).data;
    const alpha = new Float32Array(width * height);

    for (let index = 0; index < alpha.length; index++) {
      alpha[index] = pixels[index * 4 + 3]! / 255;
    }

    return alpha;
  } catch {
    // A cross-origin image taints the canvas and a video frame may not be
    // decoded yet. Either way the silhouette is unknowable.
    return null;
  } finally {
    release();
  }
};
