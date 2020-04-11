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

export interface CreateCanvasOptions {
    canvas?: HTMLCanvasElement;
    fillStyle?: string;
    width?: number;
    height?: number;
}

export const createCanvas = (options: CreateCanvasOptions = {}): HTMLCanvasElement => {
    const { canvas, fillStyle, width, height } = options;

    const newCanvas = canvas ?? document.createElement('canvas');
    const context = <CanvasRenderingContext2D>newCanvas.getContext('2d');

    newCanvas.width = width ?? 10;
    newCanvas.height = height ?? 10;

    context.fillStyle = fillStyle ?? '#6495e';
    context.fillRect(0, 0, newCanvas.width, newCanvas.height);

    return newCanvas;
};
