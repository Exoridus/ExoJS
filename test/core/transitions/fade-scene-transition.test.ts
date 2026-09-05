import { Ease } from '#animation/Ease';
import { Color } from '#core/Color';
import type { SceneTransitionPhaseContext } from '#core/scene/PhasedSceneTransition';
import type { SceneTransitionContext, SceneTransitionEnvironment } from '#core/scene/SceneTransition';
import { FadeSceneTransition } from '#core/scene/transitions/FadeSceneTransition';
import { Time } from '#core/units';
import type { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { QuadGeometry } from '#rendering/geometry/QuadGeometry';

// Exposes the protected authoring hooks through public wrappers - the
// idiomatic way to unit-test a PhasedSceneTransition subclass's own
// enter()/exit()/getPhaseRequirements() in isolation, without re-driving
// PhasedSceneTransition's own session machinery (already covered by its own
// test suite).
class TestableFadeSceneTransition extends FadeSceneTransition {
  private readonly _testState = this._createPhaseStateForSession();

  public callEnter(context: SceneTransitionPhaseContext): void {
    this.enter(context, this._testState);
  }
  public callExit(context: SceneTransitionPhaseContext): void {
    this.exit(context, this._testState);
  }
}

// The real SceneTransitionPhaseContext['rendering'] is a RenderingContext.
// FadeSceneTransition draws a full-screen tinted quad via
// rendering.drawGeometry(...), reading the screen bounds from
// rendering.screenView.getBounds() - so the stub needs both.
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

// Minimal SceneTransitionEnvironment for driving a real session through
// FadeSceneTransition.beginSession().
class TestEnvironment implements SceneTransitionEnvironment {
  public readonly context = navContext;
  private _committed = false;
  private _commitRequested = false;

  public get commitRequested(): boolean {
    return this._commitRequested;
  }

  public get committed(): boolean {
    return this._committed;
  }

  public commit(): void {
    this._commitRequested = true;
    this._committed = true;
  }
}

describe('FadeSceneTransition', () => {
  test('defaults: color black, duration 220, linear easing, placement screen', () => {
    const fade = new FadeSceneTransition();

    expect(fade.color.equals(Color.black)).toBe(true);
    expect(fade.duration).toBe(0.22);
    expect(fade.easing).toBe(Ease.linear);
    expect(fade.placement).toBe('screen');
  });

  test('accepts a custom color and options', () => {
    const customColor = new Color(255, 0, 0, 1);
    const fade = new FadeSceneTransition({ color: customColor, duration: Time.seconds(0.5), easing: Ease.cubicOut, placement: 'screen' });

    expect(fade.color).toBe(customColor);
    expect(fade.duration).toBe(0.5);
    expect(fade.easing).toBe(Ease.cubicOut);
    expect(fade.placement).toBe('screen');
  });

  // The regression this whole options-only break was for: under the old
  // (color, options) positional signature, this call silently misassigned
  // the options object to `color` instead of defaulting it - leaving both
  // assertions below false.
  test('options-only call with color omitted keeps the color default alongside the supplied option', () => {
    const fade = new FadeSceneTransition({ duration: Time.seconds(0.3) });

    expect(fade.color.equals(Color.black)).toBe(true);
    expect(fade.duration).toBe(0.3);
  });

  test('getPhaseRequirements: none/direct for both phases (no texture, no snapshot)', () => {
    const fade = new TestableFadeSceneTransition();

    expect(fade.getRequirementsForPhase('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
    expect(fade.getRequirementsForPhase('enter', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
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
    // bounds (0,0)-(800,600) - no rotation/shear component.
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

  test('does not share mutable scratch state between two sessions of the same reused definition', () => {
    const shared = new FadeSceneTransition();
    const sessionA = shared.beginSession(new TestEnvironment());
    const sessionB = shared.beginSession(new TestEnvironment());

    // Drive A to a different presence than B, then render both - if they
    // shared one Color/Matrix/QuadGeometry on the definition, the second
    // render() call would clobber the first's tint alpha before A's draw
    // call actually reads it back.
    sessionA.update(Time.toSeconds(Time.milliseconds(50)));
    sessionB.update(Time.toSeconds(Time.milliseconds(10)));

    const drawGeometryA = vi.fn();
    const drawGeometryB = vi.fn();

    sessionA.render(stubRendering(drawGeometryA), { outgoing: null, current: null, committed: false });
    sessionB.render(stubRendering(drawGeometryB), { outgoing: null, current: null, committed: false });

    const [quadA, , optionsA] = drawGeometryA.mock.calls[0] as [QuadGeometry, Matrix, { tint: Color }];
    const [quadB, , optionsB] = drawGeometryB.mock.calls[0] as [QuadGeometry, Matrix, { tint: Color }];

    expect(quadA).not.toBe(quadB); // different object identity — proves no shared scratch QuadGeometry
    expect(optionsA.tint).not.toBe(optionsB.tint); // different object identity — proves no shared scratch Color
    expect(optionsA.tint.a).not.toBeCloseTo(optionsB.tint.a); // different progress -> different alpha, would have been clobbered if shared
  });

  test("destroy() releases the session's geometry, and a second destroy() does not release it again", () => {
    const fade = new FadeSceneTransition();
    const session = fade.beginSession(new TestEnvironment());
    const drawGeometry = vi.fn();

    session.render(stubRendering(drawGeometry), { outgoing: null, current: null, committed: false });

    const [quad] = drawGeometry.mock.calls[0] as [QuadGeometry, Matrix, { tint: Color }];
    const disposed = vi.fn();

    // Backend GPU buffers hang off this callback, so it firing is what
    // "the geometry was released" actually means.
    quad._onDispose(disposed);

    // Both phase states hold a quad, even though only the exit phase rendered.
    const geometryDestroy = vi.spyOn(Geometry.prototype, 'destroy');

    session.destroy();

    expect(disposed).toHaveBeenCalledTimes(1);
    expect(geometryDestroy).toHaveBeenCalledTimes(2);

    session.destroy();

    expect(disposed).toHaveBeenCalledTimes(1);
    expect(geometryDestroy).toHaveBeenCalledTimes(2);

    geometryDestroy.mockRestore();
  });
});
