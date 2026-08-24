import { wasmType } from '#assets/types/dataTypes';

import { factoryContext } from './factory-context';

// Minimal valid Wasm module: magic number ("\0asm") + version 1, no sections.
const MINIMAL_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]).buffer;

describe('wasmType', () => {
  test('compiles a minimal valid Wasm binary into a WebAssembly.Module', async () => {
    const module = await wasmType.createFactory().create(MINIMAL_WASM, factoryContext());

    expect(module).toBeInstanceOf(WebAssembly.Module);
  });

  test('rejects for invalid Wasm bytes', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4]).buffer;

    await expect(wasmType.createFactory().create(garbage, factoryContext())).rejects.toThrow();
  });

  test('keeps the acquired bytes as the stored representation', async () => {
    const response = { arrayBuffer: async () => MINIMAL_WASM } as unknown as Response;

    await expect(wasmType.codec!.fromResponse(response, { locator: 'url:x' })).resolves.toBe(MINIMAL_WASM);
  });
});
