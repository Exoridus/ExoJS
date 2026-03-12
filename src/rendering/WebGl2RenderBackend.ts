import type { RenderBackend } from './RenderBackend';

export interface WebGl2RenderBackend extends RenderBackend {
    readonly context: WebGL2RenderingContext;
}
