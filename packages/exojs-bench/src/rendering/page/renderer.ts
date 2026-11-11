import type { CellResult, EngineAdapter } from '../EngineAdapter';

/** Read the context or device that rendered the cell, while the adapter still owns it. */
export const readCellRenderer = (adapter: EngineAdapter, canvas: HTMLCanvasElement): NonNullable<CellResult['renderer']> => {
  const device = adapter.gpuDevice?.() ?? null;

  if (device !== null) {
    const info = device.adapterInfo;
    const identity =
      info === undefined ? '' : [info.vendor, info.architecture, info.device, info.description].filter(value => value?.trim()).join(' / ');

    return { backend: 'webgpu', adapter: identity.length > 0 ? identity : null };
  }

  const gl2 = canvas.getContext('webgl2');
  const gl = gl2 ?? canvas.getContext('webgl');

  if (gl === null) {
    return { backend: null, adapter: null };
  }

  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl.getParameter(debug === null ? gl.RENDERER : debug.UNMASKED_RENDERER_WEBGL) as unknown;

  return { backend: gl2 === null ? 'webgl' : 'webgl2', adapter: typeof renderer === 'string' && renderer.trim() !== '' ? renderer : null };
};
