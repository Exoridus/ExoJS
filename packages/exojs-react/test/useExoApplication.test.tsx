import { type Application, Color } from '@codexo/exojs';
import { render } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ExoApplicationOptions, useExoApplication, type UseExoApplicationResult } from '../src/useExoApplication';
import { MockApplication } from './support/mock-application';

// Replace ONLY the GPU-bound `Application`; every pure export (Color, Scene,
// ApplicationStatus, …) stays real via `importActual`. The mock module is
// imported INSIDE the factory because `vi.mock` is hoisted above the file's
// imports, so top-level bindings are not yet initialised when it runs.
vi.mock('@codexo/exojs', async importActual => {
  const actual = await importActual<typeof import('@codexo/exojs')>();
  const { MockApplication: MockApp, configureApplicationStatus } = await import('./support/mock-application');
  configureApplicationStatus(actual.ApplicationStatus);
  return { ...actual, Application: MockApp };
});

interface HarnessProps {
  options?: ExoApplicationOptions;
  onReady?: (app: Application) => void;
  onError?: (error: unknown) => void;
  expose: (result: UseExoApplicationResult) => void;
}

/**
 * Drives `useExoApplication` and — crucially — attaches the returned `canvasRef`
 * to a real `<canvas>`, which is what makes the hook's mount effect create the
 * Application (it bails out when `canvasRef.current` is null). `expose` hands the
 * latest hook result back to the test on every render.
 */
function Harness({ options, onReady, onError, expose }: HarnessProps): ReactElement {
  const result = useExoApplication(options, onReady, onError);
  expose(result);

  return <canvas ref={result.canvasRef} data-testid="exo-canvas" />;
}

function mount(initial: Omit<HarnessProps, 'expose'>): {
  result: () => UseExoApplicationResult;
  rerender: (next: Omit<HarnessProps, 'expose'>) => void;
  unmount: () => void;
  getCanvas: () => HTMLElement;
} {
  let latest: UseExoApplicationResult | undefined;
  const expose = (r: UseExoApplicationResult): void => {
    latest = r;
  };

  const utils = render(<Harness {...initial} expose={expose} />);

  return {
    result: () => latest!,
    rerender: next => utils.rerender(<Harness {...next} expose={expose} />),
    unmount: () => utils.unmount(),
    getCanvas: () => utils.getByTestId('exo-canvas'),
  };
}

const onlyInstance = (): MockApplication => {
  expect(MockApplication.instances).toHaveLength(1);
  return MockApplication.instances[0]!;
};

beforeEach(() => {
  MockApplication.reset();
});

describe('useExoApplication — construction & wiring', () => {
  it('constructs the Application once, binds it to the rendered canvas, and calls onReady with it', () => {
    const onReady = vi.fn();
    const harness = mount({ options: { canvas: { width: 800, height: 600 } }, onReady });

    const app = onlyInstance();
    expect(app.options.canvas?.element).toBe(harness.getCanvas());
    expect(harness.result().app).toBe(app);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(app);
  });

  it('returns a canvasRef whose identity is stable across re-renders', () => {
    const harness = mount({ options: { canvas: { width: 320, height: 240 } } });
    const refBefore = harness.result().canvasRef;

    harness.rerender({ options: { canvas: { width: 640, height: 480 } } });

    expect(harness.result().canvasRef).toBe(refBefore);
    // A live prop change must NOT tear down and rebuild the Application.
    expect(MockApplication.instances).toHaveLength(1);
  });
});

describe('useExoApplication — identity vs live options', () => {
  it('recreates (and destroys) the Application when the backend type changes', () => {
    const harness = mount({ options: { backend: { type: 'webgl2' }, canvas: { width: 800, height: 600 } } });
    const first = onlyInstance();

    harness.rerender({ options: { backend: { type: 'webgpu' }, canvas: { width: 800, height: 600 } } });

    expect(MockApplication.instances).toHaveLength(2);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(harness.result().app).toBe(MockApplication.instances[1]);
  });

  it('live-syncs canvas size via app.resize without recreating the Application', () => {
    const harness = mount({ options: { canvas: { width: 800, height: 600 } } });
    const app = onlyInstance();
    expect(app.resize).toHaveBeenLastCalledWith(800, 600);

    harness.rerender({ options: { canvas: { width: 1024, height: 768 } } });

    expect(MockApplication.instances).toHaveLength(1);
    expect(app.resize).toHaveBeenLastCalledWith(1024, 768);
  });

  it('live-syncs sizingMode via the setter without recreating the Application', () => {
    const harness = mount({ options: { canvas: { width: 800, height: 600 } } });
    const app = onlyInstance();
    // No sizingMode given at mount → no assignment yet.
    expect(app.sizingModeAssignments).toEqual([]);

    harness.rerender({ options: { canvas: { width: 800, height: 600, sizingMode: 'letterbox' } } });

    expect(MockApplication.instances).toHaveLength(1);
    expect(app.sizingModeAssignments).toEqual(['letterbox']);
    expect(app.sizingMode).toBe('letterbox');
  });

  it('live-syncs clearColor via the setter without recreating the Application', () => {
    const harness = mount({ options: { canvas: { width: 800, height: 600 } } });
    const app = onlyInstance();
    expect(app.clearColorAssignments).toEqual([]);

    const red = new Color(255, 0, 0, 1);
    harness.rerender({ options: { canvas: { width: 800, height: 600 }, clearColor: red } });

    expect(MockApplication.instances).toHaveLength(1);
    expect(app.clearColorAssignments).toEqual([red]);
    expect(app.clearColor).toBe(red);
  });

  it('keys clearColor on its VALUE — a new Color with identical channels does not re-assign', () => {
    const harness = mount({ options: { canvas: { width: 800, height: 600 }, clearColor: new Color(10, 20, 30, 1) } });
    const app = onlyInstance();
    expect(app.clearColorAssignments).toHaveLength(1);

    // Different object, same r,g,b,a → colorKey is unchanged → effect must not refire.
    harness.rerender({ options: { canvas: { width: 800, height: 600 }, clearColor: new Color(10, 20, 30, 1) } });

    expect(app.clearColorAssignments).toHaveLength(1);
  });
});

describe('useExoApplication — teardown', () => {
  it('destroys the Application when the component unmounts', () => {
    const harness = mount({ options: { canvas: { width: 800, height: 600 } } });
    const app = onlyInstance();

    harness.unmount();

    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(app.destroyed).toBe(true);
  });
});

describe('useExoApplication — onError', () => {
  it('forwards Application.onError dispatches to the onError callback', () => {
    const onError = vi.fn();
    mount({ options: { canvas: { width: 800, height: 600 } }, onError });
    const app = onlyInstance();

    const error = new Error('boom');
    app.onError.dispatch(error);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('always calls the LATEST onError without resubscribing on every render', () => {
    const onErrorFirst = vi.fn();
    const onErrorSecond = vi.fn();
    const harness = mount({ options: { canvas: { width: 800, height: 600 } }, onError: onErrorFirst });
    const app = onlyInstance();

    harness.rerender({ options: { canvas: { width: 800, height: 600 } }, onError: onErrorSecond });

    app.onError.dispatch(new Error('boom'));

    expect(onErrorFirst).not.toHaveBeenCalled();
    expect(onErrorSecond).toHaveBeenCalledTimes(1);
    // A live prop change must not tear down and rebuild the Application.
    expect(MockApplication.instances).toHaveLength(1);
  });

  it('unsubscribes from onError when the component unmounts', () => {
    const onError = vi.fn();
    const harness = mount({ options: { canvas: { width: 800, height: 600 } }, onError });
    const app = onlyInstance();

    expect(app.onError.count).toBe(1);
    harness.unmount();

    expect(app.onError.count).toBe(0);
  });

  it('does not throw when no onError callback is supplied', () => {
    mount({ options: { canvas: { width: 800, height: 600 } } });
    const app = onlyInstance();

    expect(() => app.onError.dispatch(new Error('boom'))).not.toThrow();
  });
});
