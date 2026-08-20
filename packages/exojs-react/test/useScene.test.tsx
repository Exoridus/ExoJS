import { Application, ApplicationState, Scene as ExoScene } from '@codexo/exojs';
import { render, waitFor } from '@testing-library/react';
import { type DependencyList, type ReactElement, type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExoContext } from '../src/ExoContext';
import { useScene } from '../src/useScene';
import { MockApplication } from './support/mock-application';

// The mock module is imported INSIDE the factory because `vi.mock` is hoisted
// above this file's imports (top-level bindings are not initialised yet).
vi.mock('@codexo/exojs', async importActual => {
  const actual = await importActual<typeof import('@codexo/exojs')>();
  const { MockApplication: MockApp, configureApplicationState, configureConcurrentNavigationError } = await import('./support/mock-application');
  configureApplicationState(actual.ApplicationState);
  configureConcurrentNavigationError(actual.ConcurrentSceneNavigationError);
  return { ...actual, Application: MockApp };
});

class LevelScene extends ExoScene {}
class MenuScene extends ExoScene {}

function SceneProbe({ sceneClass, deps }: { sceneClass: new () => ExoScene; deps?: DependencyList }): ReactElement {
  const scene = useScene(sceneClass, deps);

  return <span data-testid="scene">{scene?.constructor.name ?? 'loading'}</span>;
}

// `app` is a MockApplication: the `@codexo/exojs` module is vi.mock'ed above, so
// `new Application()` constructs the mock. The context still types its value as
// the engine class, hence the cast on the way in.
function provide(app: MockApplication, children: ReactNode): ReactElement {
  return <ExoContext.Provider value={app as unknown as Application}>{children}</ExoContext.Provider>;
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
    expect(app.start.mock.calls[0]![0]).toBe(LevelScene);
    expect(app.scenes.change).not.toHaveBeenCalled();

    expect(await findByText('LevelScene')).toBeTruthy();
  });

  it('switches scenes via change() (not a restart) when deps change', async () => {
    const app = makeApp();
    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} deps={[1]} />));
    await view.findByText('LevelScene');

    view.rerender(provide(app, <SceneProbe sceneClass={LevelScene} deps={[2]} />));

    // The new scene is installed through change(); the engine is NOT started again.
    await waitFor(() => expect(app.scenes.change.mock.calls.some(call => call[0] === LevelScene)).toBe(true));
    expect(app.start).toHaveBeenCalledTimes(1);
  });

  it('does not call change() when the component unmounts (no public API clears the director mid-lifetime)', async () => {
    const app = makeApp();
    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} />));
    await view.findByText('LevelScene');

    view.unmount();

    // Navigation always targets a registered constructor -
    // there is no public "clear to scene-less" call. Application.destroy()
    // (owned by ExoCanvas) is the actual teardown path for a still-active scene.
    expect(app.scenes.change).not.toHaveBeenCalled();
  });

  it('routes a rejected app.start() to app.onError instead of an unhandled rejection', async () => {
    const app = makeApp();
    const onError = vi.fn();
    app.onError.add(onError);
    const failure = new Error('scene failed to load');
    app.start.mockRejectedValueOnce(failure);

    const { findByText } = render(provide(app, <SceneProbe sceneClass={LevelScene} />));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    // The probe never receives a scene - it stays in the loading state.
    expect(await findByText('loading')).toBeTruthy();
  });

  it('routes a rejected app.scenes.change() (dep-change switch) to app.onError', async () => {
    const app = makeApp();
    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} deps={[1]} />));
    await view.findByText('LevelScene');

    const onError = vi.fn();
    app.onError.add(onError);
    const failure = new Error('switch failed');
    app.scenes.change.mockRejectedValueOnce(failure);

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

  it('survives the StrictMode double effect mount without a concurrent-navigation error', async () => {
    const app = makeApp();
    const errors: Error[] = [];
    app.onError.add(error => errors.push(error));

    // StrictMode double-invokes effects in development: mount, cleanup, mount
    // again - synchronously, within the same commit. The second mount runs
    // while the first mount's app.start() is still mid-navigation.
    const { findByText } = render(
      <StrictMode>
        <ExoContext.Provider value={app as unknown as Application}>
          <SceneProbe sceneClass={LevelScene} />
        </ExoContext.Provider>
      </StrictMode>,
    );

    await waitFor(() => expect(app.state).toBe(ApplicationState.Running));

    // The second mount must join the in-flight start() rather than racing a
    // scenes.change() against its navigation.
    expect(errors).toEqual([]);
    expect(app.scenes.change).not.toHaveBeenCalled();
    expect(app.start).toHaveBeenCalledTimes(2);

    // Activated exactly once, and the surviving effect reports the live scene.
    expect(app.activations).toHaveLength(1);
    expect(await findByText('LevelScene')).toBeTruthy();
  });

  it('activates its own target after joining a start() that was already loading another scene', async () => {
    const app = makeApp();
    const onError = vi.fn();
    app.onError.add(onError);

    // Startup is already in flight for a different scene when the hook mounts.
    const starting = app.start(MenuScene);
    const { findByText } = render(provide(app, <SceneProbe sceneClass={LevelScene} />));

    await starting;

    expect(await findByText('LevelScene')).toBeTruthy();
    expect(app.scenes.change).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not report a rejected activation from an effect that was already superseded', async () => {
    const app = makeApp();
    const onError = vi.fn();
    app.onError.add(onError);
    let rejectStart!: (error: Error) => void;
    app.start.mockImplementationOnce(
      () =>
        new Promise<MockApplication>((_resolve, reject) => {
          rejectStart = reject;
        }),
    );

    const view = render(provide(app, <SceneProbe sceneClass={LevelScene} />));

    // Cleanup has run by the time the pending start() rejects - the failure
    // belongs to a run nothing is listening to any more.
    view.unmount();
    rejectStart(new Error('start failed after unmount'));

    await Promise.resolve().then(() => Promise.resolve());
    expect(onError).not.toHaveBeenCalled();
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

    // Unmount before the pending start() promise settles - the effect's
    // cleanup already ran (cancelled = true) by the time it resolves below.
    view.unmount();
    resolveStart(app);

    // Flush the microtask queue so the (now-late) `.then` in `apply()` runs;
    // it must be a no-op rather than calling change() on an unmounted tree.
    await Promise.resolve().then(() => Promise.resolve());
    expect(view.queryByText('LevelScene')).toBeNull();
  });
});
