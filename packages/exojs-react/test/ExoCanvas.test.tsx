import { render } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExoCanvas } from '../src/ExoCanvas';
import { useExoApp } from '../src/useExoApp';
import { MockApplication } from './support/mock-application';

// The mock module is imported INSIDE the factory because `vi.mock` is hoisted
// above this file's imports (top-level bindings are not initialised yet).
vi.mock('@codexo/exojs', async importActual => {
  const actual = await importActual<typeof import('@codexo/exojs')>();
  const { MockApplication: MockApp, configureApplicationStatus } = await import('./support/mock-application');
  configureApplicationStatus(actual.ApplicationStatus);
  return { ...actual, Application: MockApp };
});

/** Overlay child that proves the surrounding ExoCanvas context carries the app. */
function Hud(): ReactElement {
  const app = useExoApp();

  return <div data-testid="hud">{app === MockApplication.instances[0] ? 'has-app' : 'wrong-app'}</div>;
}

beforeEach(() => {
  MockApplication.reset();
});

describe('<ExoCanvas>', () => {
  it('renders a positioned wrapper div containing exactly one canvas', () => {
    const { container, getByTestId } = render(
      <ExoCanvas data-testid="host" options={{ canvas: { width: 800, height: 600 } }} />,
    );

    const host = getByTestId('host');
    expect(host.tagName).toBe('DIV');
    expect(host.style.position).toBe('relative');

    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(1);
    expect(host.contains(canvases[0]!)).toBe(true);
  });

  it('forwards arbitrary div props (className, data-*) and merges style onto the wrapper', () => {
    const { getByTestId } = render(
      <ExoCanvas data-testid="host" className="game-host" style={{ width: 640, background: 'black' }} />,
    );

    const host = getByTestId('host');
    expect(host.className).toBe('game-host');
    expect(host.getAttribute('data-testid')).toBe('host');
    expect(host.style.width).toBe('640px');
    expect(host.style.background).toBe('black');
    // Caller style must not clobber the relative positioning the overlay relies on.
    expect(host.style.position).toBe('relative');
  });

  it('forwards canvasProps to the inner canvas and keeps the default block display', () => {
    const { container } = render(
      <ExoCanvas canvasProps={{ className: 'pixelated', 'data-role': 'surface', style: { imageRendering: 'pixelated' } }} />,
    );

    const canvas = container.querySelector('canvas')!;
    expect(canvas.className).toBe('pixelated');
    expect(canvas.getAttribute('data-role')).toBe('surface');
    expect(canvas.style.display).toBe('block');
    expect(canvas.style.imageRendering).toBe('pixelated');
  });

  it('binds the Application to the actual rendered canvas element', () => {
    const { container } = render(<ExoCanvas options={{ canvas: { width: 800, height: 600 } }} />);

    expect(MockApplication.instances).toHaveLength(1);
    const canvas = container.querySelector('canvas');
    expect(MockApplication.instances[0]!.options.canvas?.element).toBe(canvas);
  });

  it('renders children as an overlay and provides the app to them via context', () => {
    const { getByTestId } = render(
      <ExoCanvas options={{ canvas: { width: 800, height: 600 } }}>
        <Hud />
      </ExoCanvas>,
    );

    const hud = getByTestId('hud');
    expect(hud.textContent).toBe('has-app');
  });

  it('forwards Application.onError dispatches to the onError prop', () => {
    const onError = vi.fn();
    render(<ExoCanvas options={{ canvas: { width: 800, height: 600 } }} onError={onError} />);

    const app = MockApplication.instances[0]!;
    const error = new Error('boom');
    app.onError.dispatch(error);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
