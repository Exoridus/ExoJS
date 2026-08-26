import type { BackendRenderPass } from '@codexo/exojs';
import { CallbackRenderPass, RenderPipeline } from '@codexo/exojs';
import type { RenderBackend } from '@codexo/exojs/renderer-sdk';

// #region guide:backend-pass
class MyBackendPass implements BackendRenderPass {
  public execute(backend: RenderBackend): void {
    // Raw, backend-specific draw work issued through `backend`. A pass that
    // owns the whole frame like this normally runs with `autoClear: false`,
    // so its own clear is the only one.
    backend.clear();
  }
}

const backendPass = new MyBackendPass();

// Bridge a BackendRenderPass into a high-level RenderPipeline by wrapping it in a
// CallbackRenderPass and running it through context.backend:
const pipeline = new RenderPipeline().addPass(new CallbackRenderPass(context => context.backend.execute(backendPass)));
// #endregion guide:backend-pass
