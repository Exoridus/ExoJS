import type { Application } from '#core/Application';
import type { BackendConfig } from '#core/application/ApplicationOptions';
import { isWebKitUserAgent } from '#core/utils';
import type { RendererBinding } from '#extensions/Extension';
import { materializeRendererBindings } from '#extensions/materialize';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderError } from '#rendering/RenderError';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

/** The concrete backend implementations an {@link Application} can be built on. */
export type BackendType = 'webgl2' | 'webgpu';

/**
 * What a backend reports back to the application that owns it. The two
 * implementations spell the first two differently - `onDeviceLost` /
 * `onDeviceRestored` on WebGPU, `onContextLost` / `onContextRestored` on
 * WebGL2 - which is why subscribing to them belongs here, in the one module
 * that knows both concrete classes, rather than at the call site.
 */
export interface BackendLifecycleHooks {
  onLost: () => void;
  onRestored: () => void;
  onRenderError: (error: RenderError) => void;
}

/**
 * Whether `backend: 'auto'` should pick WebGPU. Presence of `navigator.gpu` is
 * necessary but not sufficient: WebKit ships a WebGPU implementation that
 * renders this engine incorrectly - SDF text draws as an empty frame, and
 * repeated runs of the parity matrix fail a different set of scenes each time,
 * which points at the driver rather than at engine code. Neither has a feature
 * flag to test, and both produce a broken picture with no error, so `auto`
 * keeps WebKit on WebGL2, where the same scenes render correctly.
 *
 * This is not a permanent verdict. `backend: 'webgpu'` still selects it
 * explicitly for anyone testing WebKit's implementation, and the check should
 * go once the parity matrix comes back clean there.
 */
export const canUseWebGpu = (): boolean => {
  const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU }>;

  return !!gpuNavigator.gpu && !isWebKitUserAgent(navigator.userAgent);
};

/** Resolve the configured backend, letting `'auto'` and an absent config decide by host support. */
export const resolveBackendType = (config: BackendConfig | undefined): BackendType => {
  if (config?.type === 'webgl2' || config?.type === 'webgpu') {
    return config.type;
  }

  return canUseWebGpu() ? 'webgpu' : 'webgl2';
};

/**
 * Materialise the renderer bindings, destroying the backend again if any of
 * them throws.
 *
 * A backend whose bindings fail is never handed back, so it can never reach
 * the caller's ownership record - which is what lets `createBackend` run from
 * the post-construction backend fallback too, where there is no construction
 * scope to roll back.
 */
const attachRendererBindings = (backend: RenderBackend, bindings: readonly RendererBinding[]): void => {
  try {
    materializeRendererBindings(backend, bindings);
  } catch (error) {
    try {
      backend.destroy();
    } catch {
      /* cleanup failure is secondary */
    }

    throw error;
  }
};

/**
 * Build the backend for `backendType`, subscribed to `hooks` and equipped with
 * `bindings`. The returned backend is constructed but not initialized.
 *
 * Throws whatever a renderer binding threw, having destroyed the backend
 * first; nothing is returned in that case.
 */
export const createBackend = (
  app: Application,
  backendType: BackendType,
  bindings: readonly RendererBinding[],
  hooks: BackendLifecycleHooks,
): RenderBackend => {
  let backend: RenderBackend;

  if (backendType === 'webgpu') {
    const webgpu = new WebGpuBackend(app);

    webgpu.onDeviceLost.add(hooks.onLost);
    webgpu.onDeviceRestored.add(hooks.onRestored);
    backend = webgpu;
  } else {
    const webgl2 = new WebGl2Backend(app);

    webgl2.onContextLost.add(hooks.onLost);
    webgl2.onContextRestored.add(hooks.onRestored);
    backend = webgl2;
  }

  backend.onRenderError.add(hooks.onRenderError);
  attachRendererBindings(backend, bindings);

  return backend;
};
