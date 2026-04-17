import { AbstractAssetFactory } from 'resources/AbstractAssetFactory';

export class WasmFactory extends AbstractAssetFactory<WebAssembly.Module> {

    public readonly storageName = 'wasm';

    public async process(response: Response): Promise<ArrayBuffer> {
        return response.arrayBuffer();
    }

    public async create(source: ArrayBuffer): Promise<WebAssembly.Module> {
        return WebAssembly.compile(source);
    }
}
