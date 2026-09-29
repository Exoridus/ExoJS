import type { RenderingApplicationOptions } from '#core/application/ApplicationOptions';
import type { Color } from '#core/Color';
import type { OutputToneMapping, OutputTransformOptions, WorkingColorFormat } from '#rendering/OutputTransform';
import type { PixelData, ReadImageDataOptions, RenderingContext } from '#rendering/RenderingContext';
import { DataTexture, type DataTextureFormat } from '#rendering/texture/DataTexture';
import type { Rgba8TexturePayload } from '#rendering/texture/pixelPayload';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import type { TextureAlphaMode, TextureColorSpace, TextureOptions } from '#rendering/texture/TextureOptions';
import { type ColorTextureFormat, TextureFormat } from '#rendering/types';

declare const color: Color;
declare const context: RenderingContext;
declare const renderTexture: RenderTexture;
declare const freeform: string;
declare const level: Rgba8TexturePayload['levels'][number];

// Source interpretation is a closed union.
const space: TextureColorSpace = 'linear-srgb';
const alpha: TextureAlphaMode = 'premultiplied';
const options: Partial<TextureOptions> = { colorSpace: space, alphaMode: alpha, premultiplyAlpha: false };

// @ts-expect-error - colorSpace is a closed union
const looseSpace: Partial<TextureOptions> = { colorSpace: freeform };
// @ts-expect-error - alphaMode is a closed union
const looseAlpha: Partial<TextureOptions> = { alphaMode: 'none' };
// @ts-expect-error - 'display-p3' is not a supported source interpretation
const wideGamut: Partial<TextureOptions> = { colorSpace: 'display-p3' };

// Raw color creation states the meaning of its bytes; the payload cannot omit it.
const fromBytes: Texture = Texture.fromPixels({ levels: [level], colorSpace: 'srgb', alphaMode: 'straight' }, options);
// @ts-expect-error - a raw payload must declare its color space
Texture.fromPixels({ levels: [level], alphaMode: 'straight' });
// @ts-expect-error - a raw payload must declare its alpha association
Texture.fromPixels({ levels: [level], colorSpace: 'srgb' });

// Linear-light constants are written into caller-owned storage.
const linear = new Float32Array(4);
color.writeLinear(linear);
color.writeLinear(linear, 4);
// @ts-expect-error - the destination is a Float32Array, not an untyped array
color.writeLinear([0, 0, 0, 0]);

// Format unions are closed and exclude the sRGB storage format from data.
const dataFormat: DataTextureFormat = TextureFormat.Rgba32F;
const colorFormat: ColorTextureFormat = TextureFormat.Rgba8Srgb;
// @ts-expect-error - numeric data is never stored with an sRGB transfer
const srgbData: DataTextureFormat = TextureFormat.Rgba8Srgb;
// @ts-expect-error - half-float data textures are not part of the data-texture contract
const halfData: DataTextureFormat = TextureFormat.Rgba16F;
// @ts-expect-error - single-channel formats cannot be color attachments
const singleChannelColor: ColorTextureFormat = TextureFormat.R8;
// @ts-expect-error - a DataTexture cannot be created in an sRGB storage format
const srgbDataTexture = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8Srgb, data: new Uint8Array(4) });

// Display-referred image reads take a closed option set.
const image: Promise<PixelData> = context.readImageData(renderTexture);
const shot: Promise<PixelData> = context.readImageData(renderTexture, { exposure: 1, toneMapping: 'reinhard' });
const shotOptions: ReadImageDataOptions = { toneMapping: 'none' };
// @ts-expect-error - only the shipped tone mappings are accepted
const unknownMapping: ReadImageDataOptions = { toneMapping: 'aces' };
// @ts-expect-error - exposure is a number of stops
const stringExposure: ReadImageDataOptions = { exposure: '1' };
// @ts-expect-error - a display-referred read always returns bytes
const floatImage: Promise<PixelData<Float32Array>> = context.readImageData(renderTexture);

// Application output options.
const mapping: OutputToneMapping = 'reinhard';
const working: WorkingColorFormat = 'hdr';
const output: OutputTransformOptions = { workingFormat: working, exposure: -1, toneMapping: mapping };
const app: RenderingApplicationOptions = { color: output };
// @ts-expect-error - the working format is 'sdr' or 'hdr', not a texture format
const textureWorking: OutputTransformOptions = { workingFormat: TextureFormat.Rgba16F };
// @ts-expect-error - only the shipped tone mappings are accepted
const unsupportedMapping: OutputTransformOptions = { toneMapping: 'filmic' };
// @ts-expect-error - exposure is a number of stops
const stringExposureOutput: OutputTransformOptions = { exposure: 'auto' };
// @ts-expect-error - the output transform is an options object, not a preset name
const presetOutput: RenderingApplicationOptions = { color: 'hdr' };

export {
  alpha,
  app,
  colorFormat,
  dataFormat,
  floatImage,
  fromBytes,
  halfData,
  image,
  looseAlpha,
  looseSpace,
  presetOutput,
  shot,
  shotOptions,
  singleChannelColor,
  srgbData,
  srgbDataTexture,
  stringExposure,
  stringExposureOutput,
  textureWorking,
  unknownMapping,
  unsupportedMapping,
  wideGamut,
};
