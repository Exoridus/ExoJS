import type { SceneTransitionPhaseContext, SceneTransitionPhaseRequirements } from '#core/PhasedSceneTransition';
import type { SceneTransitionContext } from '#core/SceneTransition';
import { SlideSceneTransition } from '#core/transitions/SlideSceneTransition';
import type { Sprite } from '#rendering/sprite/Sprite';

// Exposes the protected authoring hooks through public wrappers — same
// pattern as FadeSceneTransition's test suite (Task 1).
class TestableSlideSceneTransition extends SlideSceneTransition {
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

const navContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

// The real SceneTransitionPhaseContext['rendering'] is a RenderingContext.
// SlideSceneTransition draws a Sprite via rendering.render(sprite, { view }),
// reading the screen bounds from rendering.screenView.getBounds() — so the
// stub needs both. Assertions inspect the captured Sprite node's own
// properties (x/y/texture/tint.a), not a plain call-argument object, since
// `render()` takes a RenderNode rather than a `{x, y, alpha}` bag.
const stubRendering = (render = vi.fn()): SceneTransitionPhaseContext['rendering'] =>
  ({
    render,
    screenView: { getBounds: () => ({ left: 0, top: 0, right: 800, bottom: 600 }) },
  }) as unknown as SceneTransitionPhaseContext['rendering'];

const stubContext = (overrides: Partial<SceneTransitionPhaseContext> = {}): SceneTransitionPhaseContext => ({
  phase: 'exit',
  progress: 0,
  easedProgress: 0,
  presence: 0,
  frame: { outgoing: null, current: {} as never, committed: false },
  rendering: stubRendering(),
  ...overrides,
});

describe('SlideSceneTransition', () => {
  test('defaults: direction right, mode push', () => {
    const slide = new SlideSceneTransition();

    expect(slide.direction).toBe('right');
    expect(slide.mode).toBe('push');
    expect(slide.getRequirements(navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
  });

  describe('mode: push', () => {
    test('both phases require currentFrame texture, no snapshot', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push' });

      expect(slide.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
      expect(slide.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
    });

    test('exit slides the outgoing texture toward `direction` (left): offset goes from 0 to -width as presence goes 1 to 0', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'left' });
      const render = vi.fn();
      const rendering = stubRendering(render);
      const currentTexture = { current: true } as never;

      slide.callExit(stubContext({ phase: 'exit', presence: 1, frame: { outgoing: null, current: currentTexture, committed: false }, rendering }));
      let [node] = render.mock.calls[render.mock.calls.length - 1] as [Sprite];
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.texture).toBe(currentTexture);

      slide.callExit(stubContext({ phase: 'exit', presence: 0, frame: { outgoing: null, current: currentTexture, committed: false }, rendering }));
      [node] = render.mock.calls[render.mock.calls.length - 1] as [Sprite];
      expect(node.x).toBe(-800);
      expect(node.y).toBe(0);
    });

    test('enter slides the incoming texture in from the opposite edge (right, for direction left) to 0', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'left' });
      const render = vi.fn();
      const rendering = stubRendering(render);
      const currentTexture = { current: true } as never;

      slide.callEnter(stubContext({ phase: 'enter', presence: 0, frame: { outgoing: null, current: currentTexture, committed: false }, rendering }));
      let [node] = render.mock.calls[render.mock.calls.length - 1] as [Sprite];
      expect(node.x).toBe(800);

      slide.callEnter(stubContext({ phase: 'enter', presence: 1, frame: { outgoing: null, current: currentTexture, committed: false }, rendering }));
      [node] = render.mock.calls[render.mock.calls.length - 1] as [Sprite];
      expect(node.x).toBe(0);
    });

    test('direction right exits toward positive offset', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'right' });
      const render = vi.fn();
      const rendering = stubRendering(render);
      const currentTexture = { current: true } as never;

      slide.callExit(stubContext({ phase: 'exit', presence: 0, frame: { outgoing: null, current: currentTexture, committed: false }, rendering }));
      const [node] = render.mock.calls[render.mock.calls.length - 1] as [Sprite];
      expect(node.x).toBe(800);
    });

    test('direction up/down offsets the y axis instead of x', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'up' });
      const render = vi.fn();
      const rendering = stubRendering(render);
      const currentTexture = { current: true } as never;

      slide.callExit(stubContext({ phase: 'exit', presence: 0, frame: { outgoing: null, current: currentTexture, committed: false }, rendering }));
      const [node] = render.mock.calls[render.mock.calls.length - 1] as [Sprite];
      expect(node.x).toBe(0);
      expect(node.y).toBe(-600);
    });
  });

  describe('mode: reveal', () => {
    test('exit requires texture, enter requires only direct (no animation)', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'reveal' });

      expect(slide.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
      expect(slide.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
    });

    test('enter() is a no-op (nothing left to animate — the reveal already happened during exit)', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'reveal' });
      const render = vi.fn();
      const rendering = stubRendering(render);

      slide.callEnter(stubContext({ phase: 'enter', presence: 1, rendering }));

      expect(render).not.toHaveBeenCalled();
    });
  });

  describe('mode: cover', () => {
    test('exit requires only direct (static, no animation), enter requires snapshot + texture', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'cover' });

      expect(slide.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
      expect(slide.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
    });

    test('exit() is a no-op (outgoing scene stays static and untouched)', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'cover' });
      const render = vi.fn();
      const rendering = stubRendering(render);

      slide.callExit(stubContext({ phase: 'exit', presence: 1, rendering }));

      expect(render).not.toHaveBeenCalled();
    });

    test('enter() draws the frozen outgoing snapshot at full opacity behind the sliding incoming texture', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'cover', direction: 'left' });
      const render = vi.fn();
      const rendering = stubRendering(render);
      const outgoingSnapshot = { snapshot: true } as never;
      const currentTexture = { current: true } as never;

      slide.callEnter(
        stubContext({
          phase: 'enter',
          presence: 0.5,
          frame: { outgoing: outgoingSnapshot, current: currentTexture, committed: true },
          rendering,
        }),
      );

      expect(render).toHaveBeenCalledTimes(2);

      const [snapshotNode] = render.mock.calls[0] as [Sprite];
      expect(snapshotNode.texture).toBe(outgoingSnapshot);
      expect(snapshotNode.x).toBe(0);
      expect(snapshotNode.y).toBe(0);
      expect(snapshotNode.tint.a).toBe(1);

      const [currentNode] = render.mock.calls[1] as [Sprite];
      expect(currentNode.texture).toBe(currentTexture);
      expect(currentNode.x).toBe(400);
      expect(currentNode.y).toBe(0);
      expect(currentNode.tint.a).toBe(1);
    });
  });
});
