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
    expect(app.start.mock.calls[0]![0]).toBeInstanceOf(TitleScene);
    expect(app.scene.setScene).not.toHaveBeenCalled();

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

  it('switches scenes via app.scene.setScene() (engine running) and forwards the transition', async () => {
    const app = makeApp();
    const view = render(<Tree app={app} active="title" />);
    await view.findByTestId('active');

    const transition: SceneTransition = { type: 'fade', duration: 300 };
    view.rerender(<Tree app={app} active="game" transition={transition} />);

    await waitFor(() => expect(app.scene.setScene).toHaveBeenCalled());
    const lastCall = app.scene.setScene.mock.calls.at(-1)!;
    expect(lastCall[0]).toBeInstanceOf(GameScene);
    expect(lastCall[1]).toEqual({ transition });

    expect((await view.findByTestId('hud')).textContent).toBe('game-hud');
    expect((await view.findByTestId('active')).textContent).toBe('GameScene');
  });

  it('clears the active scene (setScene(null)) when the active name matches no <Scene>', async () => {
    const app = makeApp();
    const view = render(<Tree app={app} active="title" />);
    await view.findByTestId('active');

    view.rerender(<Tree app={app} active="does-not-exist" />);

    await waitFor(() => expect(app.scene.setScene).toHaveBeenCalledWith(null));
    expect(view.queryByTestId('hud')).toBeNull();
  });
});
