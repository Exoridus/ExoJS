import { Application, Scene as ExoScene, type SceneTransition } from '@codexo/exojs';
import { render, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExoContext } from '../src/ExoContext';
import { Scene, Scenes, useActiveScene } from '../src/Scenes';
import { MockApplication } from './support/mock-application';

// The mock module is imported INSIDE the factory because `vi.mock` is hoisted
// above this file's imports (top-level bindings are not initialised yet).
vi.mock('@codexo/exojs', async importActual => {
  const actual = await importActual<typeof import('@codexo/exojs')>();
  const { MockApplication: MockApp, configureApplicationStatus } = await import('./support/mock-application');
  configureApplicationStatus(actual.ApplicationStatus);
  return { ...actual, Application: MockApp };
});

class TitleScene extends ExoScene {}
class GameScene extends ExoScene {}

/** Reads the active scene from the Scenes context and prints its class name. */
function ActiveProbe(): ReactElement {
  const scene = useActiveScene();

  return <span data-testid="active">{scene?.constructor.name ?? 'none'}</span>;
}

function Tree({ app, active, transition }: { app: Application; active: string; transition?: SceneTransition }): ReactElement {
  return (
    <ExoContext.Provider value={app}>
      <Scenes active={active} transition={transition}>
        <Scene name="title" component={TitleScene}>
          <span data-testid="hud">title-hud</span>
          <ActiveProbe />
        </Scene>
        <Scene name="game" component={GameScene}>
          <span data-testid="hud">game-hud</span>
          <ActiveProbe />
        </Scene>
      </Scenes>
    </ExoContext.Provider>
  );
}

const makeApp = (): MockApplication => new Application() as unknown as MockApplication;

beforeEach(() => {
  MockApplication.reset();
});

describe('<Scenes> / <Scene> / useActiveScene', () => {
  it('activates the first scene via app.start() (engine stopped) and exposes it through useActiveScene', async () => {
    const app = makeApp();
    const { findByTestId } = render(<Tree app={app} active="title" />);

    // start() is invoked synchronously inside the activation effect.
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(app.start.mock.calls[0]![0]).toBe(TitleScene);
    expect(app.scenes.change).not.toHaveBeenCalled();

    // The overlay + active-scene context appear once the start() promise resolves.
    const active = await findByTestId('active');
    expect(active.textContent).toBe('TitleScene');
    expect((await findByTestId('hud')).textContent).toBe('title-hud');
  });

  it('renders only the active scene’s children as the overlay', async () => {
    const app = makeApp();
    const { findByTestId } = render(<Tree app={app} active="title" />);

    expect((await findByTestId('hud')).textContent).toBe('title-hud');
  });

  it('switches scenes via app.scenes.change() (engine running) and forwards the transition', async () => {
    const app = makeApp();
    const view = render(<Tree app={app} active="title" />);
    await view.findByTestId('active');

    // An opaque SceneTransition instance — the wrapper only forwards it to the
    // director's change(), so its concrete behavior is irrelevant here.
    const transition = {} as unknown as SceneTransition;
    view.rerender(<Tree app={app} active="game" transition={transition} />);

    await waitFor(() => expect(app.scenes.change).toHaveBeenCalled());
    const lastCall = app.scenes.change.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe(GameScene);
    expect(lastCall[1]).toEqual({ transition });

    expect((await view.findByTestId('hud')).textContent).toBe('game-hud');
    expect((await view.findByTestId('active')).textContent).toBe('GameScene');
  });

  it('clears the local HUD overlay (without touching the director) when the active name matches no <Scene>', async () => {
    const app = makeApp();
    const view = render(<Tree app={app} active="title" />);
    await view.findByTestId('active');

    const changeCallsBefore = app.scenes.change.mock.calls.length;

    view.rerender(<Tree app={app} active="does-not-exist" />);

    // definition §10.1: no public API clears the director mid-lifetime — the
    // last-active scene keeps running underneath; only the React-rendered
    // overlay is cleared.
    await waitFor(() => expect(view.queryByTestId('hud')).toBeNull());
    expect(app.scenes.change.mock.calls.length).toBe(changeCallsBefore);
  });

  it('routes a rejected app.start() to app.onError instead of an unhandled rejection', async () => {
    const app = makeApp();
    const onError = vi.fn();
    app.onError.add(onError);
    const failure = new Error('scene failed to load');
    app.start.mockRejectedValueOnce(failure);

    const view = render(<Tree app={app} active="title" />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    // The overlay never appears — no active scene was ever installed.
    expect(view.queryByTestId('hud')).toBeNull();
  });

  it('routes a rejected app.scenes.change() (scene switch) to app.onError', async () => {
    const app = makeApp();
    const view = render(<Tree app={app} active="title" />);
    await view.findByTestId('active');

    const onError = vi.fn();
    app.onError.add(onError);
    const failure = new Error('switch failed');
    app.scenes.change.mockRejectedValueOnce(failure);

    view.rerender(<Tree app={app} active="game" />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
  });

  it('wraps a non-Error rejection from app.scenes.change() (scene switch) before dispatching it', async () => {
    const app = makeApp();
    const view = render(<Tree app={app} active="title" />);
    await view.findByTestId('active');

    const onError = vi.fn();
    app.onError.add(onError);
    app.scenes.change.mockRejectedValueOnce('switch failed as a plain string');

    view.rerender(<Tree app={app} active="game" />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('switch failed as a plain string')));
  });

  it('wraps a non-Error rejection from the first app.start() activation before dispatching it', async () => {
    const app = makeApp();
    const onError = vi.fn();
    app.onError.add(onError);
    app.start.mockRejectedValueOnce('start failed as a plain string');

    render(<Tree app={app} active="title" />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('start failed as a plain string')));
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

    const view = render(<Tree app={app} active="title" />);
    expect(app.start).toHaveBeenCalledTimes(1);

    // Unmount before the pending start() promise settles — the effect's
    // cleanup already ran (cancelled = true) by the time it resolves below.
    view.unmount();
    resolveStart(app);

    // Flush the microtask queue so the (now-late) `.then` in `apply()` runs;
    // it must be a no-op rather than calling setInstance on an unmounted tree.
    await Promise.resolve().then(() => Promise.resolve());
    expect(view.queryByTestId('active')).toBeNull();
  });

  it('ignores non-<Scene> children when collecting the scene registry', async () => {
    const app = makeApp();
    const { findByTestId } = render(
      <ExoContext.Provider value={app}>
        <Scenes active="title">
          <Scene name="title" component={TitleScene}>
            <span data-testid="hud">title-hud</span>
          </Scene>
          {'a stray text child'}
          <div data-testid="not-a-scene">ignored</div>
        </Scenes>
      </ExoContext.Provider>,
    );

    expect((await findByTestId('hud')).textContent).toBe('title-hud');
  });
});

describe('<Scene> rendered directly', () => {
  it('renders nothing on its own', () => {
    const { container } = render(<Scene name="standalone" component={TitleScene} />);
    expect(container.innerHTML).toBe('');
  });
});
