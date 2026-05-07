/**
 * Generate a `Uint16Array` of indices for `size` axis-aligned quads.
 * Each quad is split into two triangles using vertex order `0-1-2, 0-2-3`,
 * producing six indices per quad. Use with an interleaved vertex buffer where
 * every four vertices form one quad.
 */
export const createQuadIndices = (size: number): Uint16Array => {
    const data = new Uint16Array(size * 6);
    const len = data.length;

    for (let i = 0, offset = 0; i < len; i += 6, offset += 4) {
        data[i] = offset;
        data[i + 1] = offset + 1;
        data[i + 2] = offset + 2;
        data[i + 3] = offset;
        data[i + 4] = offset + 2;
        data[i + 5] = offset + 3;
    }

    return data;
};

/** Options for {@link createCanvas}. All fields are optional. */
export interface CreateCanvasOptions {
    /** Existing canvas element to reuse instead of creating a new one. */
    canvas?: HTMLCanvasElement;
    /** 2D fill colour string applied to the entire canvas surface. Defaults to `'#6495ed'`. */
    fillStyle?: string;
    /** Canvas pixel width. Defaults to `10`. */
    width?: number;
    /** Canvas pixel height. Defaults to `10`. */
    height?: number;
}

/**
 * Create or reuse an `HTMLCanvasElement` filled with a solid colour.
 * Used internally to produce placeholder textures (e.g. {@link Texture.black}, {@link Texture.white}).
 */
export const createCanvas = (options: CreateCanvasOptions = {}): HTMLCanvasElement => {
    const { canvas, fillStyle, width, height } = options;

    const newCanvas = canvas ?? document.createElement('canvas');
    const context = newCanvas.getContext('2d') as CanvasRenderingContext2D;

    newCanvas.width = width ?? 10;
    newCanvas.height = height ?? 10;

    context.fillStyle = fillStyle ?? '#6495ed';
    context.fillRect(0, 0, newCanvas.width, newCanvas.height);

    return newCanvas;
};

const heightCache: Map<string, number> = new Map<string, number>();

/**
 * Measure the line height of a CSS font string in pixels.
 * Results are cached by font string so repeated calls for the same font are cheap.
 * Uses a temporary DOM element to derive the true rendered height including leading.
 */
export const determineFontHeight = (font: string): number => {
    if (!heightCache.has(font)) {
        const body = document.body;
        const dummy = document.createElement('div');

        dummy.appendChild(document.createTextNode('M'));
        dummy.setAttribute('style', `font: ${font};position:absolute;top:0;left:0`);

        body.appendChild(dummy);
        heightCache.set(font, dummy.offsetHeight);
        body.removeChild(dummy);
    }

    return heightCache.get(font)!;
};
