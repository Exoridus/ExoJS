import { AssetDecodeError } from '#assets/AssetDecodeError';
import { compressedLevelByteLength, type CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import type { TextureColorSpace } from '#rendering/texture/TextureOptions';

import { type BasisTarget, selectBasisTarget } from './basisTargets';
import { inflateKtx2Payload, isKtx2, type Ktx2Payload, materializeKtx2 } from './ktx2';
import { type Ktx2Descriptor, parseKtx2Descriptor } from './ktx2Descriptor';

export type BasisTranscode = (buffer: ArrayBuffer, descriptor: Ktx2Descriptor, target: BasisTarget, signal?: AbortSignal) => Promise<readonly Uint8Array[]>;

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted === true) throw new DOMException('The operation was aborted.', 'AbortError');
};

/** Validates once and dispatches native, ZLIB, or off-thread universal decoding. */
export const decodeKtx2 = async (
  buffer: ArrayBuffer,
  source: string,
  formats: readonly CompressedTextureFormat[] = [],
  transcode?: BasisTranscode,
  signal?: AbortSignal,
): Promise<Ktx2Payload> => {
  throwIfAborted(signal);
  const fail = (message: string): never => {
    throw new AssetDecodeError({ message: `KTX2 file "${source}": ${message}`, assetType: 'ktx2' });
  };
  if (!isKtx2(new Uint8Array(buffer))) return fail('file does not start with the KTX2 identifier.');
  const descriptor = parseKtx2Descriptor(buffer, source);
  if (descriptor.universal === undefined) {
    return descriptor.supercompressionScheme === 3 ? inflateKtx2Payload(buffer, source, descriptor, signal) : materializeKtx2(buffer, source, descriptor);
  }
  if (transcode === undefined) return fail('universal payload requires the Basis worker runtime.');
  if (buffer.byteLength > 256 * 1024 * 1024) return fail('universal container exceeds the 256 MiB decoding budget.');
  const { pixelWidth, pixelHeight, levelCount, dfd } = descriptor;
  const target = selectBasisTarget(pixelWidth % 4 === 0 && pixelHeight % 4 === 0 ? formats : [], dfd.hasAlpha === true, dfd.transferFunction === 2);
  let decodedBytes = 0;
  const extents = Array.from({ length: levelCount }, (_, index) => {
    const width = Math.max(Math.floor(pixelWidth / 2 ** index), 1),
      height = Math.max(Math.floor(pixelHeight / 2 ** index), 1);
    const byteLength = target.format === undefined ? width * height * 4 : compressedLevelByteLength(target.format, width, height);
    // Bound both the output and the UASTC Zstd intermediate before crossing into WASM.
    decodedBytes += Math.max(byteLength, Math.ceil(width / 4) * Math.ceil(height / 4) * 16);
    if (!Number.isSafeInteger(decodedBytes) || decodedBytes > 256 * 1024 * 1024) return fail('universal payload exceeds the 256 MiB decoding budget.');
    return { width, height, byteLength };
  });
  const data = await transcode(buffer, descriptor, target, signal);
  throwIfAborted(signal);
  if (data.length !== levelCount) return fail('transcoder returned an incomplete level chain.');
  const levels = extents.map(({ width, height, byteLength }, index) => {
    const bytes = data[index];
    if (bytes?.byteLength !== byteLength) return fail(`transcoded level ${index} needs exactly ${byteLength} bytes.`);
    return { width, height, data: bytes };
  });
  let colorSpace: TextureColorSpace = 'none';
  if (dfd.transferFunction === 2) colorSpace = 'srgb';
  else if (dfd.transferFunction === 1) colorSpace = 'linear-srgb';
  const metadata = {
    colorSpace,
    alphaMode: dfd.flags === 1 ? ('premultiplied' as const) : ('straight' as const),
  };
  if (target.format !== undefined) return { kind: 'compressed', format: target.format, levels, ...metadata };
  const base = levels[0];
  if (base === undefined) return fail('transcoder returned no base level.');
  return { kind: 'rgba8', width: base.width, height: base.height, data: base.data, levels, ...metadata };
};
