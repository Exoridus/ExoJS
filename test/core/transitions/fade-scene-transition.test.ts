import { Ease } from '#animation/Easing';
import { Color } from '#core/Color';
import type { SceneTransitionPhaseContext, SceneTransitionPhaseRequirements } from '#core/PhasedSceneTransition';
import type { SceneTransitionContext } from '#core/SceneTransition';
import { FadeSceneTransition } from '#core/transitions/FadeSceneTransition';
import type { Matrix } from '#math/Matrix';
import { QuadGeometry } from '#rendering/geometry/QuadGeometry';

// Exposes the protected authoring hooks through public wrappers — the
// idiomatic way to unit-test a PhasedSceneTransition subclass's own
// enter()/exit()/getPhaseRequirements() in isolation, without re-driving
// PhasedSceneTransition's own session machinery (already covered by Slice 6's
// test suite).
class TestableFadeSceneTransition extends FadeSceneTransition {
  public callEnter(context: SceneTransitionPhaseContext): void {
    this.enter(context);
  }
  public callExit(context: SceneTransitionPhaseContext): void {
    this.exit(context);
  }
  public callGetPhaseRequirements(phase: 'enter' | 'exit', context: SceneTransitionContext): SceneTransitionPhaseRequirements {
    return this.getPhaseRequirements(phase, context);
  }
}

// The real SceneTransitionPhaseContext['rendering'] is a RenderingContext.
// FadeSceneTransition draws a full-screen tinted quad via
// rendering.drawGeometry(...), reading the screen bounds from
// rendering.screenView.getBounds() — so the stub needs both.
const stubRendering = (drawGeometry = vi.fn()): SceneTransitionPhaseContext['rendering'] =>
  ({
    drawGeometry,
    screenView: { getBounds: () => ({ left: 0, top: 0, right: 800, bottom: 600 }) },
  }) as unknown as SceneTransitionPhaseContext['rendering'];

const stubContext = (overrides: Partial<SceneTransitionPhaseContext> = {}): SceneTransitionPhaseContext => ({
  phase: 'enter',
  progress: 0,
  easedProgress: 0,
  presence: 0,
  frame: { outgoing: null, current: null, committed: false },
  rendering: stubRendering(),
  ...overrides,
});

const navContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

describe('FadeSceneTransition', () => {
  test('defaults: color black, duration 220, linear easing, placement screen', () => {
    const fade = new FadeSceneTransition();

    expect(fade.color.equals(Color.black)).toBe(true);
    expect(fade.duration).toBe(220);
    expect(fade.easing).toBe(Ease.linear);
    expect(fade.placement).toBe('screen');
  });

  test('accepts a custom color and options', () => {
    const customColor = new Color(255, 0, 0, 1);
    const fade = new FadeSceneTransition(customColor, { duration: 500, easing: Ease.cubicOut });

    expect(fade.color).toBe(customColor);
    expect(fade.duration).toBe(500);
    expect(fade.easing).toBe(Ease.cubicOut);
  });

  test('getPhaseRequirements: none/direct for both phases (no texture, no snapshot)', () => {
    const fade = new TestableFadeSceneTransition();

    expect(fade.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
    expect(fade.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });

  test('getRequirements() merges identical exit/enter requirements unchanged', () => {
    const fade = new FadeSceneTransition();

    expect(fade.getRequirements(navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });

  test("exit(): draws a full-screen quad at alpha = 1 - presence, in this transition's color", () => {
    const fade = new TestableFadeSceneTransition();
    const drawGeometry = vi.fn();
    const context = stubContext({ phase: 'exit', presence: 0.25, rendering: stubRendering(drawGeometry) });

    fade.callExit(context);

    expect(drawGeometry).toHaveBeenCalledTimes(1);
    const [geometry, transform, options] = drawGeometry.mock.calls[0] as [QuadGeometry, Matrix, { tint: Color }];

    // Untextured full-screen quad, scaled/translated to the stubbed screen
    // bounds (0,0)-(800,600) — no rotation/shear component.
    expect(geometry).toBeInstanceOf(QuadGeometry);
    expect(transform.equals({ a: 800, b: 0, x: 0, c: 0, d: 600, y: 0 })).toBe(true);
    expect(options.tint.equals({ r: fade.color.r, g: fade.color.g, b: fade.color.b, a: 0.75 })).toBe(true);
  });

  test('enter(): draws the quad at alpha = 1 - presence, symmetric with exit()', () => {
    const fade = new TestableFadeSceneTransition();
    const drawGeometry = vi.fn();
    const context = stubContext({ phase: 'enter', presence: 0.6, rendering: stubRendering(drawGeometry) });

    fade.callEnter(context);

    const [, , options] = drawGeometry.mock.calls[0] as [QuadGeometry, Matrix, { tint: Color }];
    expect(options.tint.equals({ r: fade.color.r, g: fade.color.g, b: fade.color.b, a: 0.4 })).toBe(true);
  });

  test('exit() at presence 1 (start of exit) draws a fully transparent quad', () => {
    const fade = new TestableFadeSceneTransition();
    const drawGeometry = vi.fn();

    fade.callExit(stubContext({ phase: 'exit', presence: 1, rendering: stubRendering(drawGeometry) }));

    const [, , options] = drawGeometry.mock.calls[0] as [QuadGeometry, Matrix, { tint: Color }];
    expect(options.tint.a).toBe(0);
  });

  test('exit() at presence 0 (end of exit, about to commit) draws a fully opaque quad', () => {
    const fade = new TestableFadeSceneTransition();
    const drawGeometry = vi.fn();

    fade.callExit(stubContext({ phase: 'exit', presence: 0, rendering: stubRendering(drawGeometry) }));

    const [, , options] = drawGeometry.mock.calls[0] as [QuadGeometry, Matrix, { tint: Color }];
    expect(options.tint.a).toBe(1);
  });
});
