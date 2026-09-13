/**
 * Backend selection on its own: which backend `auto` picks, and why WebKit is
 * held back from WebGPU regardless of `navigator.gpu`.
 */
import { canUseWebGpu, resolveBackendType } from '#core/application/backendSelection';

const webkitUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const chromiumUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const stubHost = (options: { gpu: unknown; userAgent: string }): (() => void) => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

  Object.defineProperty(navigator, 'gpu', { configurable: true, value: options.gpu });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => options.userAgent });

  return (): void => {
    if (previousGpu) {
      Object.defineProperty(navigator, 'gpu', previousGpu);
    } else {
      Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'gpu');
    }

    if (previousUserAgent) {
      Object.defineProperty(navigator, 'userAgent', previousUserAgent);
    }
  };
};

describe('backend selection', () => {
  test('an explicit choice is taken as given, whatever the host supports', () => {
    const restore = stubHost({ gpu: {}, userAgent: chromiumUserAgent });

    try {
      expect(resolveBackendType({ type: 'webgl2' })).toBe('webgl2');
      expect(resolveBackendType({ type: 'webgpu' })).toBe('webgpu');
    } finally {
      restore();
    }
  });

  test('an explicit webgpu choice survives a host auto would keep on WebGL2', () => {
    const restore = stubHost({ gpu: {}, userAgent: webkitUserAgent });

    try {
      expect(resolveBackendType({ type: 'webgpu' })).toBe('webgpu');
    } finally {
      restore();
    }
  });

  test('auto picks WebGPU where the host offers it', () => {
    const restore = stubHost({ gpu: {}, userAgent: chromiumUserAgent });

    try {
      expect(resolveBackendType({ type: 'auto' })).toBe('webgpu');
      expect(canUseWebGpu()).toBe(true);
    } finally {
      restore();
    }
  });

  test('an absent config behaves as auto', () => {
    const restore = stubHost({ gpu: {}, userAgent: chromiumUserAgent });

    try {
      expect(resolveBackendType(undefined)).toBe('webgpu');
    } finally {
      restore();
    }
  });

  test('auto falls back to WebGL2 without navigator.gpu', () => {
    const restore = stubHost({ gpu: undefined, userAgent: chromiumUserAgent });

    try {
      expect(resolveBackendType({ type: 'auto' })).toBe('webgl2');
      expect(canUseWebGpu()).toBe(false);
    } finally {
      restore();
    }
  });

  test('WebKit is kept on WebGL2 even though it reports navigator.gpu', () => {
    const restore = stubHost({ gpu: {}, userAgent: webkitUserAgent });

    try {
      expect(canUseWebGpu()).toBe(false);
      expect(resolveBackendType({ type: 'auto' })).toBe('webgl2');
    } finally {
      restore();
    }
  });
});
