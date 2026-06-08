import { AbstractAssetFactory } from '#resources/AbstractAssetFactory';

/**
 * {@link AssetFactory} implementation that loads WebAssembly binary (`.wasm`)
 * files and produces a compiled {@link WebAssembly.Module}.
 *
 * The module is compiled but not instantiated — callers receive a reusable
 * `WebAssembly.Module` that can be instantiated multiple times with different
 * import objects via `new WebAssembly.Instance(module, imports)`.
 */
export class WasmFactory extends AbstractAssetFactory<WebAssembly.Module> {
  public readonly storageName = 'wasm';

  /**
   * Reads the full response body as an {@link ArrayBuffer} containing the
   * raw Wasm binary.
   */
  public async process(response: Response): Promise<ArrayBuffer> {
    return response.arrayBuffer();
  }

  /**
   * Compiles the Wasm binary asynchronously via {@link WebAssembly.compile}
   * and returns the resulting module.
   */
  public async create(source: ArrayBuffer): Promise<WebAssembly.Module> {
    return WebAssembly.compile(source);
  }
}
