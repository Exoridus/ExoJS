import { Color } from '@/core/Color';
import type { RenderPassCoordinator } from '@/rendering/pass/RenderPassCoordinator';
import type { RenderPassDescriptor } from '@/rendering/pass/RenderPassDescriptor';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTargetPass } from '@/rendering/RenderTargetPass';
import { RenderTexture } from '@/rendering/texture/RenderTexture';

// RenderTargetPass is RenderBackend-typed and reaches the (backend-specific,
// non-interface) coordinator through an optional duck-typed accessor. These
// tests pin both branches: the coordinator path and the legacy inline fallback.
const createBackend = (coordinator?: RenderPassCoordinator) => {
  const root = new RenderTarget(64, 64, true);
  let currentTarget: RenderTarget = root;

  const setRenderTarget = vi.fn((target: RenderTarget | null) => {
    currentTarget = target ?? root;
  });
  const setView = vi.fn(() => undefined);
  const clear = vi.fn(() => undefined);

  const backend = {
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentTarget.view;
    },
    setRenderTarget,
    setView,
    clear,
    ...(coordinator ? { _passCoordinator: coordinator } : {}),
  } as unknown as RenderBackend;

  return { backend, root, setRenderTarget, setView, clear };
};

describe('RenderTargetPass coordinator routing', () => {
  test('routes save/restore through the pass coordinator when the backend exposes one', () => {
    const withChildPass = vi.fn((_descriptor: RenderPassDescriptor, body: () => void) => body());
    const coordinator = { withChildPass } as unknown as RenderPassCoordinator;
    const { backend, root, setRenderTarget } = createBackend(coordinator);
    const target = new RenderTexture(32, 32);
    let ran = false;

    const pass = new RenderTargetPass(
      () => {
        ran = true;
      },
      { target, clearColor: Color.red },
    );

    try {
      pass.execute(backend);

      expect(withChildPass).toHaveBeenCalledTimes(1);

      const descriptor = withChildPass.mock.calls[0][0];

      expect(descriptor.target).toBe(target);
      expect(descriptor.clearColor).toBe(Color.red);
      expect(descriptor.load).toBe('clear');
      expect(ran).toBe(true);
      // The coordinator owns save/restore — the inline fallback must not run.
      expect(setRenderTarget).not.toHaveBeenCalled();
    } finally {
      target.destroy();
      root.destroy();
    }
  });

  test('descriptor load is "load" when no clear colour is configured', () => {
    const withChildPass = vi.fn((_descriptor: RenderPassDescriptor, body: () => void) => body());
    const coordinator = { withChildPass } as unknown as RenderPassCoordinator;
    const { backend, root } = createBackend(coordinator);
    const target = new RenderTexture(32, 32);

    const pass = new RenderTargetPass(() => undefined, { target });

    try {
      pass.execute(backend);

      expect(withChildPass.mock.calls[0][0].load).toBe('load');
      expect(withChildPass.mock.calls[0][0].clearColor).toBeNull();
    } finally {
      target.destroy();
      root.destroy();
    }
  });

  test('falls back to inline target save-restore when no coordinator is present', () => {
    const { backend, root, setRenderTarget, clear } = createBackend();
    const target = new RenderTexture(32, 32);
    const order: string[] = [];

    setRenderTarget.mockImplementation((boundTarget: RenderTarget | null) => {
      order.push(`setRenderTarget:${boundTarget === target ? 'target' : 'root'}`);
    });

    const pass = new RenderTargetPass(
      () => {
        order.push('callback');
      },
      { target, clearColor: Color.red },
    );

    try {
      pass.execute(backend);

      expect(clear).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['setRenderTarget:target', 'callback', 'setRenderTarget:root']);
    } finally {
      target.destroy();
      root.destroy();
    }
  });

  test('falls back and still restores the previous target when the callback throws', () => {
    const { backend, root, setRenderTarget } = createBackend();
    const target = new RenderTexture(32, 32);
    const boundTargets: (RenderTarget | null)[] = [];

    setRenderTarget.mockImplementation((boundTarget: RenderTarget | null) => {
      boundTargets.push(boundTarget);
    });

    const pass = new RenderTargetPass(
      () => {
        throw new Error('boom');
      },
      { target },
    );

    try {
      expect(() => pass.execute(backend)).toThrow('boom');
      expect(boundTargets[boundTargets.length - 1]).toBe(root);
    } finally {
      target.destroy();
      root.destroy();
    }
  });
});
