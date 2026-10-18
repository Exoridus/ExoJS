import { Application, ApplicationState, FadeSceneTransition, Scene as ExoScene, type SceneTransitionSelection, Time } from '@codexo/exojs';
import { render, waitFor } from '@testing-library/react';
import { type ReactElement, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExoContext } from '../src/ExoContext';
import { Scene, Scenes, useActiveScene } from '../src/Scenes';
import { MockApplication } from './support/mock-application';

// The mock module is imported INSIDE the factory because `vi.mock` is hoisted
// above this file's imports (top-level bindings are not initialised yet).
vi.mock('@codexo/exojs', async importActual => {
  const actual = await importActual<typeof import('@codexo/exojs')>();
  const {
    MockApplication: MockApp,
    configureApplicationState,
    configureConcurrentNavigationError,
  } = await import('./support/mock-application');
  configureApplicationState(actual.ApplicationState);
  configureConcurrentNavigationError(actual.ConcurrentSceneNavigationError);

  return { ...actual, Application: MockApp };
});

class TitleScene extends ExoScene {}
class GameScene extends ExoScene {}

/** Reads the active scene from the Scenes context and prints its class name. */
const ActiveProbe = (): ReactElement => {
  const scene = useActiveScene();

  return <span data-testid="active">{scene?.constructor.name ?? 'none'}</span>;
};

// `app` is a MockApplication: the `@codexo/exojs` module is vi.mock'ed above, so
// `new Application()` constructs the mock. The context still types its value as
// the engine class, hence the cast on the way in.
const Tree = ({
  app,
  active,
  transition,
}: {
  app: MockApplication;
  active: string;
  transition?: SceneTransitionSelection;
}): ReactElement => (
  <ExoContext.Provider value={app as unknown as Application}>
    <Scenes active={active} {...(transition === undefined ? {} : { transition })}>
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

    // A real SceneTransition instance - the wrapper only forwards it to the
    // director's change(), so its concrete behavior is irrelevant here.
    const transition = new FadeSceneTransition({ duration: Time.seconds(0.3) });
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

    // No public API clears the director mid-lifetime - the
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
    // The overlay never appears - no active scene was ever installed.
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

    // Unmount before the pending start() promise settles - the effect's
    // cleanup already ran (cancelled = true) by the time it resolves below.
    view.unmount();
    resolveStart(app);

    // Flush the microtask queue so the (now-late) `.then` in `apply()` runs;
    // it must be a no-op rather than calling setInstance on an unmounted tree.
    await Promise.resolve().then(() => Promise.resolve());
    expect(view.queryByTestId('active')).toBeNull();
  });

  it('survives the StrictMode double effect mount with exactly one activation and a visible HUD', async () => {
    const app = makeApp();
    const errors: Error[] = [];
    app.onError.add(error => errors.push(error));

    // StrictMode mounts, cleans up and re-mounts the activation effect within
    // one commit, so the second run lands while the first run's app.start() is
    // still mid-navigation.
    const view = render(
      <StrictMode>
        <Tree app={app} active="title" />
      </StrictMode>,
    );

    await waitFor(() => expect(app.state).toBe(ApplicationState.Running));

    expect(errors).toEqual([]);
    expect(app.scenes.change).not.toHaveBeenCalled();
    expect(app.activations).toHaveLength(1);
    expect(app.activations[0]).toBeInstanceOf(TitleScene);
    expect((await view.findByTestId('hud')).textContent).toBe('title-hud');
    expect((await view.findByTestId('active')).textContent).toBe('TitleScene');
  });

  it('neither navigates nor reports anything when unmounted while the first start() is still loading', async () => {
    const app = makeApp();
    const errors: Error[] = [];
    app.onError.add(error => errors.push(error));

    const view = render(
      <StrictMode>
        <Tree app={app} active="title" />
      </StrictMode>,
    );
    expect(app.state).toBe(ApplicationState.Loading);

    view.unmount();

    await waitFor(() => expect(app.state).toBe(ApplicationState.Running));
    await Promise.resolve().then(() => Promise.resolve());

    expect(errors).toEqual([]);
    expect(app.scenes.change).not.toHaveBeenCalled();
    expect(app.activations).toHaveLength(1);
    expect(view.queryByTestId('hud')).toBeNull();
  });

  it('switches to a new active target chosen while the first start() is still loading', async () => {
    const app = makeApp();
    const errors: Error[] = [];
    app.onError.add(error => errors.push(error));

    const view = render(
      <StrictMode>
        <Tree app={app} active="title" />
      </StrictMode>,
    );
    expect(app.state).toBe(ApplicationState.Loading);

    view.rerender(
      <StrictMode>
        <Tree app={app} active="game" />
      </StrictMode>,
    );

    expect((await view.findByTestId('hud')).textContent).toBe('game-hud');
    expect((await view.findByTestId('active')).textContent).toBe('GameScene');

    expect(errors).toEqual([]);
    // The superseded title run does not navigate; the game run joins startup
    // and then switches exactly once.
    expect(app.scenes.change).toHaveBeenCalledTimes(1);
    expect(app.scenes.change.mock.calls[0]![0]).toBe(GameScene);
    expect(app.activations.map(scene => (scene as ExoScene).constructor)).toEqual([TitleScene, GameScene]);
  });

  it('does not navigate again when the active target returns to the one startup is already loading', async () => {
    const app = makeApp();
    const errors: Error[] = [];
    app.onError.add(error => errors.push(error));

    const view = render(<Tree app={app} active="title" />);
    view.rerender(<Tree app={app} active="game" />);
    view.rerender(<Tree app={app} active="title" />);

    expect((await view.findByTestId('hud')).textContent).toBe('title-hud');
    expect(errors).toEqual([]);
    expect(app.scenes.change).not.toHaveBeenCalled();
    expect(app.activations).toHaveLength(1);
  });

  it('ignores non-<Scene> children when collecting the scene registry', async () => {
    const app = makeApp();
    const { findByTestId } = render(
      <ExoContext.Provider value={app as unknown as Application}>
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

describe('useActiveScene(SceneClass)', () => {
  const NarrowedProbe = ({ sceneClass }: { sceneClass: abstract new () => ExoScene }): ReactElement => {
    const scene = useActiveScene(sceneClass);

    return <span data-testid="narrowed">{scene?.constructor.name ?? 'none'}</span>;
  };

  const NarrowedTree = ({ app, active }: { app: MockApplication; active: string }): ReactElement => (
    <ExoContext.Provider value={app as unknown as Application}>
      <Scenes active={active}>
        <Scene name="title" component={TitleScene}>
          <span data-testid="hud">title-hud</span>
          <NarrowedProbe sceneClass={GameScene} />
        </Scene>
        <Scene name="game" component={GameScene}>
          <span data-testid="hud">game-hud</span>
          <NarrowedProbe sceneClass={GameScene} />
        </Scene>
      </Scenes>
    </ExoContext.Provider>
  );

  it('returns the active scene when it is an instance of the given class', async () => {
    const app = makeApp();
    const view = render(<NarrowedTree app={app} active="game" />);

    expect((await view.findByTestId('hud')).textContent).toBe('game-hud');
    expect(view.getByTestId('narrowed').textContent).toBe('GameScene');
  });

  it('returns null when the active scene is of a different class', async () => {
    const app = makeApp();
    const view = render(<NarrowedTree app={app} active="title" />);

    expect((await view.findByTestId('hud')).textContent).toBe('title-hud');
    expect(view.getByTestId('narrowed').textContent).toBe('none');
  });

  it('matches subclasses of the given class', async () => {
    class BonusGameScene extends GameScene {}
    const app = makeApp();
    const view = render(
      <ExoContext.Provider value={app as unknown as Application}>
        <Scenes active="bonus">
          <Scene name="bonus" component={BonusGameScene}>
            <NarrowedProbe sceneClass={GameScene} />
          </Scene>
        </Scenes>
      </ExoContext.Provider>,
    );

    expect((await view.findByTestId('narrowed')).textContent).toBe('BonusGameScene');
  });
});

describe('<Scene> rendered directly', () => {
  it('renders nothing on its own', () => {
    const { container } = render(<Scene name="standalone" component={TitleScene} />);
    expect(container.innerHTML).toBe('');
  });
});
