import { Ease } from '#animation/Easing';
import type { SceneTransitionContext, SceneTransitionEnvironment, SceneTransitionFrame } from '#core/SceneTransition';
import { Time } from '#core/Time';
import { CrossFadeSceneTransition } from '#core/transitions/CrossFadeSceneTransition';
import type { RenderingContext } from '#rendering/RenderingContext';
import type { Sprite } from '#rendering/sprite/Sprite';

// beginSession() is public (wraps the protected createSession()) — the real
// entry point any consumer (the Director) uses; no protected-access shim needed here.
const navContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

const makeEnvironment = (): SceneTransitionEnvironment & { _committed: boolean } => {
  const env = {
    context: navContext,
    commitRequested: false,
    committed: false,
    _committed: false,
    commit(): void {
      env.commitRequested = true;
      env.committed = true; // this test double treats "requested" and "committed" as the same tick
      env._committed = true;
    },
  };

  return env;
};

// CrossFadeSceneTransition draws Sprites via context.render(sprite, { view })
// — a full-frame crossfade needs no offset math, so unlike SlideSceneTransition
// the stub's screenView is never actually read; an empty object satisfies the
// type. Assertions inspect the captured Sprite node's own properties
// (texture/x/y/tint.a), since render() takes a RenderNode, not a plain
// `{alpha}` options bag.
const stubRendering = (render = vi.fn()): RenderingContext =>
  ({
    render,
    screenView: {},
  }) as unknown as RenderingContext;

describe('CrossFadeSceneTransition', () => {
  test('getRequirements(): snapshot + texture, regardless of context', () => {
    const crossFade = new CrossFadeSceneTransition();

    expect(crossFade.getRequirements(navContext)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
  });

  test('beginSession() requests commit synchronously (no separate exit hold, unlike FadeSceneTransition)', () => {
    const crossFade = new CrossFadeSceneTransition();
    const environment = makeEnvironment();

    crossFade.beginSession(environment);

    expect(environment.commitRequested).toBe(true);
  });

  test('session.placement is "scene"', () => {
    const crossFade = new CrossFadeSceneTransition();
    const session = crossFade.beginSession(makeEnvironment());

    expect(session.placement).toBe('scene');
  });

  test('done stays false while not yet committed, even after ticks past the configured duration', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 100 });
    const environment: SceneTransitionEnvironment = {
      context: navContext,
      commitRequested: false,
      committed: false, // never flips true in this test — simulates a still-in-flight prepare()
      commit(): void {
        environment.commitRequested = true;
      },
    };
    const session = crossFade.beginSession(environment);

    session.update(new Time(1000));

    expect(session.done).toBe(false);
  });

  test('render() before commit draws only frame.current at full opacity (still the outgoing scene)', () => {
    const crossFade = new CrossFadeSceneTransition();
    const environment: SceneTransitionEnvironment = {
      context: navContext,
      commitRequested: false,
      committed: false,
      commit(): void {
        environment.commitRequested = true;
      },
    };
    const session = crossFade.beginSession(environment);
    const render = vi.fn();
    const rendering = stubRendering(render);
    const outgoingLive = {} as never;
    const frame: SceneTransitionFrame = { outgoing: null, current: outgoingLive, committed: false };

    session.render(rendering, frame);

    expect(render).toHaveBeenCalledTimes(1);

    const [node] = render.mock.calls[0] as [Sprite];
    expect(node.texture).toBe(outgoingLive);
    expect(node.tint.a).toBe(1);
    expect(node.x).toBe(0);
    expect(node.y).toBe(0);
  });

  test('once committed, blends outgoing snapshot (alpha 1) under current texture (alpha ramping via easing)', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 100, easing: Ease.linear });
    const environment = makeEnvironment();
    const session = crossFade.beginSession(environment); // commit() already ran synchronously

    session.update(new Time(40));

    const render = vi.fn();
    const rendering = stubRendering(render);
    const outgoingSnapshot = { snapshot: true } as never;
    const currentTexture = { current: true } as never;

    session.render(rendering, { outgoing: outgoingSnapshot, current: currentTexture, committed: true });

    expect(render).toHaveBeenCalledTimes(2);

    const [outgoingNode] = render.mock.calls[0] as [Sprite];
    expect(outgoingNode.texture).toBe(outgoingSnapshot);
    expect(outgoingNode.tint.a).toBe(1);
    expect(outgoingNode.x).toBe(0);
    expect(outgoingNode.y).toBe(0);

    const [currentNode] = render.mock.calls[1] as [Sprite];
    expect(currentNode.texture).toBe(currentTexture);
    expect(currentNode.tint.a).toBeCloseTo(0.4);
    expect(currentNode.x).toBe(0);
    expect(currentNode.y).toBe(0);
  });

  test('done becomes true once elapsed (post-commit) reaches duration, never before', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 100 });
    const environment = makeEnvironment();
    const session = crossFade.beginSession(environment);

    session.update(new Time(60));
    expect(session.done).toBe(false);

    session.update(new Time(60));
    expect(session.done).toBe(true);
  });

  test('duration 0 completes on the first post-commit update() tick', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 0 });
    const environment = makeEnvironment();
    const session = crossFade.beginSession(environment);

    session.update(new Time(0));

    expect(session.done).toBe(true);
  });

  test('destroy() does not throw (no owned resources — pooled textures are Director-owned)', () => {
    const crossFade = new CrossFadeSceneTransition();
    const session = crossFade.beginSession(makeEnvironment());

    expect(() => session.destroy()).not.toThrow();
  });

  test('defaults: duration 220, linear easing', () => {
    const crossFade = new CrossFadeSceneTransition();

    expect(crossFade.duration).toBe(220);
    expect(crossFade.easing).toBe(Ease.linear);
  });
});
