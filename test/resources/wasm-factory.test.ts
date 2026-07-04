import { WasmFactory } from '#resources/factories/WasmFactory';

// Minimal valid Wasm module: magic number ("\0asm") + version 1, no sections.
const MINIMAL_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]).buffer;

describe('WasmFactory', () => {
  test('storageName is "wasm"', () => {
    const factory = new WasmFactory();
    expect(factory.storageName).toBe('wasm');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new WasmFactory();
    const response = { arrayBuffer: async () => MINIMAL_WASM } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(MINIMAL_WASM);
  });

  test('create() compiles a minimal valid Wasm binary into a WebAssembly.Module', async () => {
    const factory = new WasmFactory();

    const module = await factory.create(MINIMAL_WASM);

    expect(module).toBeInstanceOf(WebAssembly.Module);
  });

  test('create() rejects for invalid Wasm bytes', async () => {
    const factory = new WasmFactory();
    const garbage = new Uint8Array([1, 2, 3, 4]).buffer;

    await expect(factory.create(garbage)).rejects.toThrow();
  });
});
