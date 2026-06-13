import { Color } from '#core/Color';
import type { BackendRenderPass } from '#rendering/BackendRenderPass';
import { CallbackRenderPass } from '#rendering/CallbackRenderPass';
import type { RenderPassCoordinator } from '#rendering/pass/RenderPassCoordinator';
import type { RenderPassDescriptor } from '#rendering/pass/RenderPassDescriptor';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderingContext, RenderOptions } from '#rendering/RenderingContext';
import type { RenderNode } from '#rendering/RenderNode';
import { RenderNodePass } from '#rendering/RenderNodePass';
import { RenderTexture } from '#rendering/texture/RenderTexture';

const playRenderTreeMock = vi.hoisted(() => vi.fn());
vi.mock('#rendering/plan/playRenderTree', () => ({ playRenderTree: playRenderTreeMock }));

const createContext = () => {
  const descriptors: RenderPassDescriptor[] = [];
  const coordinator = {
    withChildPass: vi.fn((descriptor: RenderPassDescriptor, body: () => void) => {
      descriptors.push(descriptor);
      body();
    }),
  } as unknown as RenderPassCoordinator;

  const executed: BackendRenderPass[] = [];
  const cleared: Array<Color | undefined> = [];
  const backend = {
    _passCoordinator: coordinator,
    execute: vi.fn(function (this: RenderBackend, pass: BackendRenderPass) {
      executed.push(pass);
      pass.execute(this);

      return this;
    }),
    clear: vi.fn(function (this: RenderBackend, color?: Color) {
      cleared.push(color);

      return this;
    }),
  } as unknown as RenderBackend;

  const rendered: Array<{ node: RenderNode; options: RenderOptions | undefined }> = [];
  const context = {
    backend,
    render: vi.fn((node: RenderNode, options?: RenderOptions) => {
      rendered.push({ node, options });
    }),
  } as unknown as RenderingContext;

  return { context, backend, descriptors, executed, cleared, rendered };
};

const fakeNode = (): RenderNode => ({}) as RenderNode;

beforeEach(() => {
  playRenderTreeMock.mockClear();
});

describe('RenderNodePass', () => {
  test('without a target, renders the node into the active target (camera default)', () => {
    const { context, rendered, cleared } = createContext();
    const node = fakeNode();

    new RenderNodePass(node).execute(context);

    expect(rendered).toHaveLength(1);
    expect(rendered[0].node).toBe(node);
    expect(rendered[0].options?.view).toBeUndefined();
    expect(cleared).toHaveLength(0);
  });

  test('without a target, an explicit view is forwarded to context.render', () => {
    const { context, rendered } = createContext();
    const node = fakeNode();
    const view = new RenderTexture(16, 16).view;

    new RenderNodePass(node, { view }).execute(context);

    expect(rendered[0].options?.view).toBe(view);
  });

  test('without a target, clear runs backend.clear before the node renders', () => {
    const { context, cleared, rendered } = createContext();

    new RenderNodePass(fakeNode(), { clear: Color.red }).execute(context);

    expect(cleared).toEqual([Color.red]);
    expect(rendered).toHaveLength(1);
  });

  test('with a target, redirects through a BackendTargetPass; view defaults to target.view', () => {
    const { context, descriptors, executed } = createContext();
    const node = fakeNode();
    const target = new RenderTexture(32, 32);

    new RenderNodePass(node, { target }).execute(context);

    expect(executed).toHaveLength(1);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].target).toBe(target);
    expect(descriptors[0].view).toBe(target.view);
    expect(descriptors[0].load).toBe('load');
    expect(playRenderTreeMock).toHaveBeenCalledWith(node, context.backend);

    target.destroy();
  });

  test('with a target, clear maps to a clearing child pass', () => {
    const { context, descriptors } = createContext();
    const target = new RenderTexture(32, 32);

    new RenderNodePass(fakeNode(), { target, clear: Color.green }).execute(context);

    expect(descriptors[0].load).toBe('clear');
    expect(descriptors[0].clearColor).toBe(Color.green);

    target.destroy();
  });

  test('with a target, an explicit view overrides target.view', () => {
    const { context, descriptors } = createContext();
    const target = new RenderTexture(32, 32);
    const override = new RenderTexture(8, 8).view;

    new RenderNodePass(fakeNode(), { target, view: override }).execute(context);

    expect(descriptors[0].view).toBe(override);

    target.destroy();
  });

  test('reuses one redirect pass across frames (no per-frame allocation)', () => {
    const { context, executed } = createContext();
    const target = new RenderTexture(32, 32);
    const pass = new RenderNodePass(fakeNode(), { target });

    pass.execute(context);
    pass.execute(context);

    expect(executed).toHaveLength(2);
    expect(executed[0]).toBe(executed[1]);

    target.destroy();
  });

  test('destroy() does not destroy the node or the caller target', () => {
    const target = new RenderTexture(32, 32);
    const node = { destroy: vi.fn() } as unknown as RenderNode;
    const pass = new RenderNodePass(node, { target });

    pass.destroy();

    expect((node as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy).not.toHaveBeenCalled();
    // The caller target is still usable.
    expect(target.width).toBe(32);

    target.destroy();
  });
});

describe('CallbackRenderPass', () => {
  test('without a target, runs the callback with the context', () => {
    const { context, cleared } = createContext();
    const callback = vi.fn();

    new CallbackRenderPass(callback).execute(context);

    expect(callback).toHaveBeenCalledWith(context);
    expect(cleared).toHaveLength(0);
  });

  test('without a target, clear runs before the callback', () => {
    const { context, cleared } = createContext();
    const order: string[] = [];
    const callback = vi.fn(() => order.push('callback'));
    context.backend.clear = vi.fn(() => {
      order.push('clear');

      return context.backend;
    });

    new CallbackRenderPass(callback, { clear: Color.black }).execute(context);

    expect(order).toEqual(['clear', 'callback']);
    expect(cleared).toHaveLength(0); // replaced spy used
  });

  test('with a target, redirects and runs the callback inside the child pass', () => {
    const { context, descriptors, executed } = createContext();
    const target = new RenderTexture(64, 64);
    const callback = vi.fn();

    new CallbackRenderPass(callback, { target }).execute(context);

    expect(executed).toHaveLength(1);
    expect(descriptors[0].target).toBe(target);
    expect(descriptors[0].view).toBe(target.view);
    expect(callback).toHaveBeenCalledWith(context);

    target.destroy();
  });

  test('with a target, an explicit view overrides target.view', () => {
    const { context, descriptors } = createContext();
    const target = new RenderTexture(64, 64);
    const override = new RenderTexture(8, 8).view;

    new CallbackRenderPass(vi.fn(), { target, view: override }).execute(context);

    expect(descriptors[0].view).toBe(override);

    target.destroy();
  });

  test('reuses one redirect pass across frames (no per-frame allocation)', () => {
    const { context, executed } = createContext();
    const target = new RenderTexture(64, 64);
    const pass = new CallbackRenderPass(vi.fn(), { target });

    pass.execute(context);
    pass.execute(context);

    expect(executed[0]).toBe(executed[1]);

    target.destroy();
  });

  test('bridges a BackendRenderPass into the pipeline via context.backend.execute', () => {
    const { context, executed } = createContext();
    const backendPass: BackendRenderPass = { execute: vi.fn() };

    new CallbackRenderPass(c => {
      c.backend.execute(backendPass);
    }).execute(context);

    expect(executed).toContain(backendPass);
    expect(backendPass.execute).toHaveBeenCalledWith(context.backend);
  });

  test('rejects direct self-reentrancy', () => {
    const { context } = createContext();
    // Holder so the callback can reach its own pass without a self-referential `let`.
    const ref: CallbackRenderPass[] = [];
    ref[0] = new CallbackRenderPass(c => ref[0].execute(c));

    expect(() => ref[0].execute(context)).toThrow(/re-entrant/);
  });

  test('rejects self-reentrancy inside a target redirect (active context cannot be clobbered)', () => {
    const { context } = createContext();
    const target = new RenderTexture(32, 32);
    const ref: CallbackRenderPass[] = [];
    ref[0] = new CallbackRenderPass(c => ref[0].execute(c), { target });

    expect(() => ref[0].execute(context)).toThrow(/re-entrant/);

    target.destroy();
  });

  test('releases the reentrancy guard after the callback throws (still runnable)', () => {
    const { context } = createContext();
    let shouldThrow = true;
    const pass = new CallbackRenderPass(() => {
      if (shouldThrow) {
        throw new Error('boom');
      }
    });

    expect(() => pass.execute(context)).toThrow('boom');

    shouldThrow = false;
    expect(() => pass.execute(context)).not.toThrow();
  });

  test('releases the guard after a targeted callback throws (state stays consistent)', () => {
    const { context } = createContext();
    const target = new RenderTexture(32, 32);
    let shouldThrow = true;
    const pass = new CallbackRenderPass(
      () => {
        if (shouldThrow) {
          throw new Error('boom');
        }
      },
      { target },
    );

    expect(() => pass.execute(context)).toThrow('boom');

    shouldThrow = false;
    expect(() => pass.execute(context)).not.toThrow();

    target.destroy();
  });

  test('nested distinct callback passes run in order', () => {
    const { context } = createContext();
    const order: string[] = [];
    const inner = new CallbackRenderPass(() => order.push('inner'));
    const outer = new CallbackRenderPass(c => {
      order.push('outer-start');
      inner.execute(c);
      order.push('outer-end');
    });

    outer.execute(context);

    expect(order).toEqual(['outer-start', 'inner', 'outer-end']);
  });
});
