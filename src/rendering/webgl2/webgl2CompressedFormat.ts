import { CompressedTextureFormat, orderCompressedFormats } from '#rendering/texture/CompressedTextureFormat';

/**
 * Internal formats of the compressed-texture extensions, as constants.
 *
 * They are read from the extension objects at runtime in principle, but every
 * one of these is a fixed enum value in its registry entry and several of the
 * extension objects are typed as `{}` in the DOM lib, so a literal table is both
 * shorter and better typed than probing each object for a property that is
 * declared nowhere.
 */
const enum Gl {
  CompressedRgbaS3tcDxt1 = 0x83f1,
  CompressedRgbaS3tcDxt3 = 0x83f2,
  CompressedRgbaS3tcDxt5 = 0x83f3,
  CompressedRedRgtc1 = 0x8dbb,
  CompressedRedGreenRgtc2 = 0x8dbd,
  CompressedRgbBptcUnsignedFloat = 0x8e8f,
  CompressedRgbaBptcUnorm = 0x8e8c,
  CompressedR11Eac = 0x9270,
  CompressedRg11Eac = 0x9272,
  CompressedRgb8Etc2 = 0x9274,
  CompressedRgb8PunchthroughAlpha1Etc2 = 0x9276,
  CompressedRgba8Etc2Eac = 0x9278,
  CompressedRgbaAstc4x4 = 0x93b0,
  CompressedRgbaAstc5x5 = 0x93b2,
  CompressedRgbaAstc6x6 = 0x93b4,
  CompressedRgbaAstc8x8 = 0x93b7,
}

/** Extension name each format family needs, and the internal format per member. */
const families: ReadonlyArray<{ readonly extension: string; readonly formats: Readonly<Partial<Record<CompressedTextureFormat, number>>> }> = [
  {
    extension: 'WEBGL_compressed_texture_s3tc',
    formats: {
      [CompressedTextureFormat.Bc1RgbaUnorm]: Gl.CompressedRgbaS3tcDxt1,
      [CompressedTextureFormat.Bc2RgbaUnorm]: Gl.CompressedRgbaS3tcDxt3,
      [CompressedTextureFormat.Bc3RgbaUnorm]: Gl.CompressedRgbaS3tcDxt5,
    },
  },
  {
    extension: 'EXT_texture_compression_rgtc',
    formats: {
      [CompressedTextureFormat.Bc4RUnorm]: Gl.CompressedRedRgtc1,
      [CompressedTextureFormat.Bc5RgUnorm]: Gl.CompressedRedGreenRgtc2,
    },
  },
  {
    extension: 'EXT_texture_compression_bptc',
    formats: {
      [CompressedTextureFormat.Bc6hRgbUfloat]: Gl.CompressedRgbBptcUnsignedFloat,
      [CompressedTextureFormat.Bc7RgbaUnorm]: Gl.CompressedRgbaBptcUnorm,
    },
  },
  {
    extension: 'WEBGL_compressed_texture_etc',
    formats: {
      [CompressedTextureFormat.Etc2Rgb8Unorm]: Gl.CompressedRgb8Etc2,
      [CompressedTextureFormat.Etc2Rgb8A1Unorm]: Gl.CompressedRgb8PunchthroughAlpha1Etc2,
      [CompressedTextureFormat.Etc2Rgba8Unorm]: Gl.CompressedRgba8Etc2Eac,
      [CompressedTextureFormat.EacR11Unorm]: Gl.CompressedR11Eac,
      [CompressedTextureFormat.EacRg11Unorm]: Gl.CompressedRg11Eac,
    },
  },
  {
    extension: 'WEBGL_compressed_texture_astc',
    formats: {
      [CompressedTextureFormat.Astc4x4Unorm]: Gl.CompressedRgbaAstc4x4,
      [CompressedTextureFormat.Astc5x5Unorm]: Gl.CompressedRgbaAstc5x5,
      [CompressedTextureFormat.Astc6x6Unorm]: Gl.CompressedRgbaAstc6x6,
      [CompressedTextureFormat.Astc8x8Unorm]: Gl.CompressedRgbaAstc8x8,
    },
  },
];

/** The compressed formats one context implements, and the internal format each uploads as. */
export interface Webgl2CompressedFormatSupport {
  readonly formats: readonly CompressedTextureFormat[];
  readonly internalFormats: ReadonlyMap<CompressedTextureFormat, number>;
}

/**
 * Probe `gl` for the compressed-texture extensions and build its format table.
 *
 * Run once per context: `getExtension` is a comparatively expensive call and
 * enabling an extension is idempotent, so there is nothing to gain from asking
 * again per upload. ETC2/EAC is deliberately probed like the rest - WebGL2
 * exposes it through `WEBGL_compressed_texture_etc` rather than as a core
 * format, so assuming its presence from the context version alone would claim
 * support on every desktop browser that lacks it.
 */
export const probeWebgl2CompressedFormats = (gl: WebGL2RenderingContext): Webgl2CompressedFormatSupport => {
  const internalFormats = new Map<CompressedTextureFormat, number>();

  for (const { extension, formats } of families) {
    if (gl.getExtension(extension) === null) {
      continue;
    }

    for (const [format, internalFormat] of Object.entries(formats)) {
      internalFormats.set(format as CompressedTextureFormat, internalFormat);
    }
  }

  return { formats: orderCompressedFormats(internalFormats.keys()), internalFormats };
};
