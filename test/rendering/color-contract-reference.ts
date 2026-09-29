type LinearRgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

interface DisplayOptions {
  readonly exposureStops?: number;
  readonly toneMapping?: 'none' | 'reinhard';
  readonly matte?: LinearRgb;
}

export const decodeSrgb = (encoded: number): number => (encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4);

export const encodeSrgb = (linear: number): number => (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055);

export const premultiply = (linear: LinearRgb, alpha: number): LinearRgb => [linear[0] * alpha, linear[1] * alpha, linear[2] * alpha];

export const sourceOver = (source: LinearRgb, sourceAlpha: number, destination: LinearRgb, destinationAlpha: number): Rgba => {
  const destinationWeight = 1 - sourceAlpha;
  return [
    source[0] + destination[0] * destinationWeight,
    source[1] + destination[1] * destinationWeight,
    source[2] + destination[2] * destinationWeight,
    sourceAlpha + destinationAlpha * destinationWeight,
  ];
};

const displayEncode = (linear: number, exposureStops: number, toneMapping: DisplayOptions['toneMapping']): number => {
  const exposed = linear * 2 ** exposureStops;
  let mapped: number;

  if (Number.isNaN(exposed) || exposed === -Infinity || exposed <= 0) {
    mapped = 0;
  } else if (exposed === Infinity) {
    mapped = 1;
  } else if (toneMapping === 'reinhard') {
    mapped = exposed / (1 + exposed);
  } else {
    mapped = Math.min(exposed, 1);
  }

  return encodeSrgb(mapped);
};

export const displayOutput = (color: LinearRgb, alpha: number, options: DisplayOptions = {}): Rgba => {
  const exposureStops = options.exposureStops ?? 0;
  const toneMapping = options.toneMapping ?? 'none';
  let straight: LinearRgb;
  let outputAlpha = alpha;

  if (options.matte !== undefined) {
    straight = [color[0] + (1 - alpha) * options.matte[0], color[1] + (1 - alpha) * options.matte[1], color[2] + (1 - alpha) * options.matte[2]];
    outputAlpha = 1;
  } else if (alpha > 0) {
    straight = [color[0] / alpha, color[1] / alpha, color[2] / alpha];
  } else {
    return [0, 0, 0, 0];
  }

  return [
    displayEncode(straight[0], exposureStops, toneMapping) * outputAlpha,
    displayEncode(straight[1], exposureStops, toneMapping) * outputAlpha,
    displayEncode(straight[2], exposureStops, toneMapping) * outputAlpha,
    outputAlpha,
  ];
};

export const formatBytesPerPixel = (format: 'rgba8' | 'rgba16f' | 'rgba32f'): number => {
  switch (format) {
    case 'rgba8':
      return 4;
    case 'rgba16f':
      return 8;
    case 'rgba32f':
      return 16;
  }
};

export const textureBytes = (width: number, height: number, bytesPerPixel: number, mipLevelCount = 1): number => {
  let total = 0;
  let levelWidth = width;
  let levelHeight = height;

  for (let level = 0; level < mipLevelCount; level++) {
    total += levelWidth * levelHeight * bytesPerPixel;
    levelWidth = Math.max(1, Math.floor(levelWidth / 2));
    levelHeight = Math.max(1, Math.floor(levelHeight / 2));
  }

  return total;
};
