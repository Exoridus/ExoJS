import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const revision = '99f52d63aa6799cbdaecfe977111dc5ec3b31d47';
const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'exojs-basis-fixtures-'));
const output = join(root, 'test/fixtures/basis');

interface Encoder {
  setCreateKTX2File(value: boolean): void;
  setUASTC(value: boolean): void;
  setKTX2UASTCSupercompression(value: boolean): void;
  setKTX2AndBasisSRGBTransferFunc(value: boolean): void;
  setPerceptual(value: boolean): void;
  setMipSRGB(value: boolean): void;
  setMipGen(value: boolean): void;
  setCheckForAlpha(value: boolean): void;
  setForceAlpha(value: boolean): void;
  setQualityLevel(value: number): void;
  setSliceSourceImage(slice: number, data: Uint8Array, width: number, height: number, type: number): void;
  encode(destination: Uint8Array): number;
  delete(): void;
}
type CreateEncoder = (options: { wasmBinary: Uint8Array; print: () => void }) => Promise<{ initializeBasis: () => void; BasisEncoder: new () => Encoder }>;

try {
  for (const extension of ['js', 'wasm']) {
    const response = await fetch(`https://raw.githubusercontent.com/BinomialLLC/basis_universal/${revision}/webgl/encoder/build/basis_encoder.${extension}`);
    if (!response.ok) throw new Error(`Encoder download failed: ${response.status}`);
    writeFileSync(join(scratch, extension === 'js' ? 'encoder.cjs' : 'encoder.wasm'), new Uint8Array(await response.arrayBuffer()));
  }
  const create = createRequire(import.meta.url)(join(scratch, 'encoder.cjs')) as CreateEncoder;
  const module = await create({ wasmBinary: readFileSync(join(scratch, 'encoder.wasm')), print: () => undefined });
  module.initializeBasis();
  mkdirSync(output, { recursive: true });
  const manifest = [];
  for (const width of [28, 17])
    for (const uastc of [false, true])
      for (const alpha of [false, true])
        for (const srgb of [false, true])
          for (const zstd of uastc ? [false, true] : [false]) {
            if (width === 17 && (!alpha || !srgb || zstd)) continue;
            const height = width === 28 ? 12 : 9;
            const data = new Uint8Array(width * height * 4);
            for (let index = 0; index < data.length; index += 4) data.set([128, 64, 32, alpha ? 128 : 255], index);
            const encoder = new module.BasisEncoder();
            try {
              encoder.setCreateKTX2File(true);
              encoder.setUASTC(uastc);
              encoder.setKTX2UASTCSupercompression(zstd);
              encoder.setKTX2AndBasisSRGBTransferFunc(srgb);
              encoder.setPerceptual(srgb);
              encoder.setMipSRGB(srgb);
              encoder.setMipGen(true);
              encoder.setCheckForAlpha(true);
              encoder.setForceAlpha(alpha);
              encoder.setQualityLevel(255);
              encoder.setSliceSourceImage(0, data, width, height, 0);
              const destination = new Uint8Array(1024 * 1024),
                length = encoder.encode(destination);
              if (length === 0) throw new Error('Basis encoding failed.');
              const file = `${uastc ? 'uastc' : 'etc1s'}-${alpha ? 'alpha' : 'opaque'}-${srgb ? 'srgb' : 'linear'}${zstd ? '-zstd' : ''}${width === 17 ? '-odd' : ''}.ktx2`;
              const bytes = destination.subarray(0, length);
              writeFileSync(join(output, file), bytes);
              manifest.push({ file, width, height, rgba: [128, 64, 32, alpha ? 128 : 255], sha256: createHash('sha256').update(bytes).digest('hex') });
            } finally {
              encoder.delete();
            }
          }
  writeFileSync(join(output, 'manifest.json'), `${JSON.stringify({ revision, fixtures: manifest }, null, 2)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
