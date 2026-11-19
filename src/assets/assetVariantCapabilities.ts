export const defaultImageFormats = Object.freeze(['png', 'jpg', 'jpeg', 'gif']);

// A 1x1 WebP decoded locally, using the same decoder as a loaded texture.
const webp = 'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAgA0JaACdLoB+AADsAD+8MQL/yC5YXXI1/8gP+QH/ID/+PIAAAA=';

export const probeAssetImageFormats = async (): Promise<readonly string[]> => {
  if (typeof createImageBitmap !== 'function') {
    return defaultImageFormats;
  }

  try {
    const bytes = Uint8Array.from(atob(webp), value => value.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
    bitmap.close();

    return [...defaultImageFormats, 'webp'];
  } catch {
    return defaultImageFormats;
  }
};
