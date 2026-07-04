import { Application, Scene as ExoScene } from '@codexo/exojs';
import { render, waitFor } from '@testing-library/react';
import { type DependencyList, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExoContext } from '../src/ExoContext';
import { useScene } from '../src/useScene';
import { MockApplication } from './support/mock-application';

// The mock module is imported INSIDE the factory because `vi.mock` is hoisted
// above this file's imports (top-level bindings are not initialised yet).
vi.mock('@codexo/exojs', async importActual => {
  const actual = await importActual<typeof import('@codexo/exojs')>();
  const { MockApplication: MockApp, configureApplicationStatus } = await import('./support/mock-application');
  configureApplicationStatus(actual.ApplicationStatus);
  return { ...actual, Application: MockApp };
});

class LevelScene extends ExoScene {}

function SceneProbe({ sceneClass, deps }: { sceneClass: new () => ExoScene; deps?: DependencyList }): ReactElement {
  const scene = useScene(sceneClass, deps);

  return <span data-testid="scene">{scene?.constructor.name ?? 'loading'}</span>;
}

function provide(app: Application, children: ReactNode): ReactElement {
  return <ExoContext.Provider value={app}>{children}</ExoContext.Provider>;
}

const makeApp = (): MockApplication => new Application() as unknown as MockApplication;

beforeEach(() => {
  MockApplication.reset();
});

describe('useScene', () => {
  it('starts the engine on first activation and returns the live scene', async () => {
    const app = makeApp();
    const { findByText } = render(provide(app, <SceneProbe sceneClass={LevelScene} />));

    expect(app.start).toHaveBeenCalledTimes(1);
    expect(app.start.mock.calls[0]![0]).toBeInstanceOf(LevelScene);
    expect(app.scene.setScene).not.toHaveBeenCalled();

    expect(await findByText('LevelScene')).toBeTruthy();
  });

  it('switches scenes via setScene (not a restart) when deps change', async () => {
    const app = makeApp();
    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} deps={[1]} />));
    await view.findByText('LevelScene');

    view.rerender(provide(app, <SceneProbe sceneClass={LevelScene} deps={[2]} />));

    // The new scene is installed through setScene; the engine is NOT started again.
    await waitFor(() => expect(app.scene.setScene.mock.calls.some(call => call[0] instanceof LevelScene)).toBe(true));
    expect(app.start).toHaveBeenCalledTimes(1);
  });

  it('clears the scene (setScene(null)) on unmount', async () => {
    const app = makeApp();
    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} />));
    await view.findByText('LevelScene');

    view.unmount();

    expect(app.scene.setScene).toHaveBeenCalledWith(null);
  });

  it('routes a rejected app.start() to app.onError instead of an unhandled rejection', async () => {
    const app = makeApp();
    const onError = vi.fn();
    app.onError.add(onError);
    const failure = new Error('scene failed to load');
    app.start.mockRejectedValueOnce(failure);

    const { findByText } = render(provide(app, <SceneProbe sceneClass={LevelScene} />));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    // The probe never receives a scene — it stays in the loading state.
    expect(await findByText('loading')).toBeTruthy();
  });

  it('routes a rejected app.scene.setScene() (dep-change switch) to app.onError', async () => {
    const app = makeApp();
    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} deps={[1]} />));
    await view.findByText('LevelScene');

    const onError = vi.fn();
    app.onError.add(onError);
    const failure = new Error('switch failed');
    app.scene.setScene.mockRejectedValueOnce(failure);

    view.rerender(provide(app, <SceneProbe sceneClass={LevelScene} deps={[2]} />));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
  });

  it('wraps a non-Error rejection from the first app.start() activation before dispatching it', async () => {
    const app = makeApp();
    const onError = vi.fn();
    app.onError.add(onError);
    app.start.mockRejectedValueOnce('start failed as a plain string');

    render(provide(app, <SceneProbe sceneClass={LevelScene} />));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('start failed as a plain string')));
  });

  it('wraps a non-Error rejection from the best-effort setScene(null) cleanup on unmount before dispatching it', async () => {
    const app = makeApp();
    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} />));
    await view.findByText('LevelScene');

    const onError = vi.fn();
    app.onError.add(onError);
    app.scene.setScene.mockRejectedValueOnce('clear failed as a plain string');

    view.unmount();

    await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('clear failed as a plain string')));
  });

  it('does not install the scene when the component unmounts before app.start() resolves', async () => {
    const app = makeApp();
    let resolveStart!: (value: MockApplication) => void;
    app.start.mockImplementationOnce(
      () =>
        new Promise<MockApplication>(resolve => {
          resolveStart = resolve;
        }),
    );

    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} />));
    expect(app.start).toHaveBeenCalledTimes(1);

    // Unmount before the pending start() promise settles — the effect's
    // cleanup already ran (cancelled = true) by the time it resolves below.
    view.unmount();
    resolveStart(app);

    // Flush the microtask queue so the (now-late) `.then` in `apply()` runs;
    // it must be a no-op rather than calling setScene on an unmounted tree.
    await Promise.resolve().then(() => Promise.resolve());
    expect(view.queryByText('LevelScene')).toBeNull();
  });
});
