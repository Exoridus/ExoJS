import type { RenderBackend } from './RenderBackend';

export interface RenderPass {
    execute(backend: RenderBackend): void;
}
