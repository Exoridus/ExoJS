import type { RenderBackend } from '#rendering/RenderBackend';
import type { PixelData, ReadPixelsOptions, RenderingContext } from '#rendering/RenderingContext';
import { type PixelRead, PixelReader } from '#rendering/texture/PixelReader';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

declare const context: RenderingContext;
declare const backend: RenderBackend;
declare const texture: RenderTexture;

const bytes: Promise<PixelData> = context.readPixels(texture);
const floats: Promise<PixelData<Float32Array>> = context.readPixels(texture, { dataType: 'float32' });
const byteReader: PixelReader = context.createPixelReader(texture);
const floatReader: PixelReader<Float32Array> = context.createPixelReader(texture, { dataType: 'float32' });
const byteRead: PixelRead | null = byteReader.request();
const floatRead: PixelRead<Float32Array> | null = floatReader.request();
const direct = new PixelReader<Float32Array>(backend, texture, { dataType: 'float32' });
declare const options: ReadPixelsOptions<'uint8' | 'float32'>;
declare const byteOptions: ReadPixelsOptions;
const byteOptionsResult: Promise<PixelData> = context.readPixels(texture, byteOptions);
const dynamic: Promise<PixelData<Uint8ClampedArray | Float32Array>> = context.readPixels(texture, options);

// @ts-expect-error Float readers require an explicit payload discriminator.
new PixelReader<Float32Array>(backend, texture);
// @ts-expect-error Float readers cannot select a byte payload.
new PixelReader<Float32Array>(backend, texture, { dataType: 'uint8' });
// @ts-expect-error A type argument cannot replace the runtime payload discriminator.
void backend.readPixels<'float32'>(texture, 0, 0, 1, 1);
// @ts-expect-error A type argument cannot replace the runtime payload discriminator.
backend.createPixelReadback<'float32'>(texture, 0, 0, 1, 1, 1);
// @ts-expect-error The default backend payload is bytes.
const backendWrong: Promise<Float32Array> = backend.readPixels(texture, 0, 0, 1, 1);
// @ts-expect-error The default read returns bytes.
const wrong: Promise<PixelData<Float32Array>> = context.readPixels(texture);

export { byteOptionsResult, byteRead, bytes, direct, dynamic, floatRead, floats, wrong };
