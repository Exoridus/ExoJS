import type { IRenderBackend } from './IRenderBackend';

export interface IWebGl2RenderBackend extends IRenderBackend {
    readonly context: WebGL2RenderingContext;
}
