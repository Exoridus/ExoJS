/**
 * Real end-to-end ordering guarantees spanning `InputManager` and
 * `InteractionManager` together: a single global chronological journal
 * across every tracked pointer AND every context-menu request, driven by
 * real `PointerEvent`/`contextmenu` dispatches through a real `<canvas>` via
 * `BrowserPlatform`, into a real `InputManager`, and (for the
 * `InteractionManager` cases) a real `InteractionManager` attached to a real
 * `Scene` root - not manual `app.input.onPointerX.dispatch(...)` calls in
 * isolation. Covers the four confirmed defects this file's tests were
 * written against:
 *
 *  - Bug A: `InputManager` used to dispatch one pointer's WHOLE per-frame
 *    phase list before moving to the next pointer's, silently losing true
 *    cross-pointer arrival order (`P1 Down -> P2 Down -> P1 Up` became
 *    `P1 Down, P1 Up, P2 Down`).
 *  - Bug B: a context-menu request was a single overwritable slot, always
 *    flushed after every pointer phase in a fixed type-order - a second
 *    request in the same frame silently clobbered the first, and neither
 *    ever interleaved with a pointer phase in true arrival order.
 *  - Bug C: `InteractionManager` re-grouped `InputManager`'s (now correctly
 *    ordered) signals back into per-pointer buckets internally, losing the
 *    same cross-pointer ordering a second time even once Bug A was fixed.
 *  - Bug D: a swipe (or any `Up` that does not produce a tap) left
 *    `_pressTargets` stale, corrupting the NEXT unrelated press cycle into
 *    firing a bogus `pointertap`.
 */

import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneState } from '#core/SceneState';
import { Time } from '#core/Time';
import { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { Drawable } from '#rendering/Drawable';

// ---------------------------------------------------------------------------
// Minimal concrete RenderNode subclass for hit-testing (mirrors
// test/input/interaction.test.ts's TestSprite).
// ---------------------------------------------------------------------------

class TestSprite extends Drawable {
  private _left = 0;
  private _top = 0;
  private _width = 0;
  private _height = 0;

  public setBounds(left: number, top: number, width: number, height: number): this {
    this._left = left;
    this._top = top;
    this._width = width;
    this._height = height;

    return this;
  }

  public override contains(x: number, y: number): boolean {
    return x >= this._left && x < this._left + this._width && y >= this._top && y < this._top + this._height;
  }

  public override getBounds(): Rectangle {
    return new Rectangle(this._left, this._top, this._width, this._height);
  }
}

// ---------------------------------------------------------------------------
// Harness: a real InputManager + real InteractionManager, both wired to a
// real Scene root, driven by real dispatched events through a real canvas
// (mirrors test/input/input-manager-events.test.ts's createMockApp/fire).
// ---------------------------------------------------------------------------

const createCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  return canvas;
};

interface Harness {
  app: Application;
  canvas: HTMLCanvasElement;
  scene: Scene;
  input: InputManager;
  interaction: InteractionManager;
}

const createHarness = (): Harness => {
  const canvas = createCanvas();
  const scene = new Scene();
  const identity = { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) };

  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    pixelRatio: 1,
    options: {
      input: {
        gamepadDefinitions: [],
        pointerDistanceThreshold: 10,
      },
    },
    _backingStoreToLogical: (backingStoreX: number, backingStoreY: number): { x: number; y: number } => ({ x: backingStoreX, y: backingStoreY }),
    rendering: { view: identity, screenView: identity },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
  } as unknown as Application;

  const input = new InputManager(app);

  (app as unknown as { input: InputManager }).input = input;

  const interaction = new InteractionManager(app);

  interaction.attachRoot(scene.root);

  return { app, canvas, scene, input, interaction };
};

const destroyHarness = (h: Harness): void => {
  h.interaction.destroy();
  h.input.destroy();
};

/**
 * One full app-update tick: input first, then interaction - matching
 * `Application.update`'s real order, including the deferred pointer
 * retirement finalized only after interaction dispatch has fully drained
 * (even if a node handler throws).
 */
const tick = (h: Harness): void => {
  h.input.preUpdate(Time.zero);

  try {
    h.interaction.preUpdate();
  } finally {
    h.input._finishInteractionFrame();
  }
};

const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): PointerEvent => {
  const evt = new PointerEvent(type, { bubbles: true, ...init });

  canvas.dispatchEvent(evt);

  return evt;
};

const fireContextMenu = (canvas: HTMLCanvasElement, clientX: number, clientY: number): MouseEvent => {
  const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY });

  canvas.dispatchEvent(evt);

  return evt;
};

// ---------------------------------------------------------------------------
// Bug A - cross-pointer chronological order at InputManager
// ---------------------------------------------------------------------------

describe('InputManager — cross-pointer chronological order (Bug A)', () => {
  test('P1 Down -> P2 Down -> P1 Up dispatches in exactly that order, not grouped per pointer', () => {
    const { input, canvas } = createHarness();
    const calls: string[] = [];

    input.onPointerDown.add(pointer => calls.push(`down:${pointer.id}`));
    input.onPointerUp.add(pointer => calls.push(`up:${pointer.id}`));

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'mouse', clientX: 20, clientY: 20, isPrimary: false });
    input.preUpdate(Time.zero);
    calls.length = 0;

    // True arrival order: P1 presses, THEN P2 presses, THEN P1 releases -
    // all inside the same frame, before update() ever runs.
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 20, clientY: 20, isPrimary: false });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    input.preUpdate(Time.zero);

    // The old per-pointer-grouped dispatch would have produced
    // ['down:1', 'up:1', 'down:2'] - this pinpoints the exact defect.
    expect(calls).toEqual(['down:1', 'down:2', 'up:1']);

    input.destroy();
  });

  test('adjacent same-pointer moves still coalesce into the latest', () => {
    const { input, canvas } = createHarness();
    const calls: Array<{ x: number; y: number }> = [];

    input.onPointerMove.add((_pointer, x, y) => calls.push({ x, y }));

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    input.preUpdate(Time.zero);

    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 11, clientY: 10, isPrimary: true });
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 12, clientY: 10, isPrimary: true });
    input.preUpdate(Time.zero);

    expect(calls).toEqual([{ x: 12, y: 10 }]);

    input.destroy();
  });

  test('P1 Move, P2 Move, P1 Move stays THREE distinct dispatches — coalescing only applies to entries immediately adjacent in the GLOBAL order', () => {
    const { input, canvas } = createHarness();
    const calls: Array<{ id: number; x: number; y: number }> = [];

    input.onPointerMove.add((pointer, x, y) => calls.push({ id: pointer.id, x, y }));

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'mouse', clientX: 20, clientY: 20, isPrimary: false });
    input.preUpdate(Time.zero);

    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 11, clientY: 10, isPrimary: true });
    fire(canvas, 'pointermove', { pointerId: 2, pointerType: 'mouse', clientX: 21, clientY: 20, isPrimary: false });
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 12, clientY: 10, isPrimary: true });
    input.preUpdate(Time.zero);

    // A naive "coalesce by pointer id regardless of position" implementation
    // would collapse this to two dispatches (one per id); the SAME-position
    // adjacency rule requires all three to survive since a P2 entry sits
    // between the two P1 moves in the true global order.
    expect(calls.map(c => c.id)).toEqual([1, 2, 1]);
    expect(calls[0]).toEqual({ id: 1, x: 11, y: 10 });
    expect(calls[2]).toEqual({ id: 1, x: 12, y: 10 });

    input.destroy();
  });
});

// ---------------------------------------------------------------------------
// Bug B - context-menu requests: true interleaving + queue (not a slot)
// ---------------------------------------------------------------------------

describe('InputManager — context-menu ordering and queuing (Bug B)', () => {
  test('a context-menu request dispatches relative to a pointer move in true arrival order, not always after every pointer phase', () => {
    const { input, canvas } = createHarness();
    const calls: string[] = [];

    input.onPointerMove.add(pointer => calls.push(`move:${pointer.id}`));
    input.onContextMenu.add(request => calls.push(`menu:${request.x},${request.y}`));

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    input.preUpdate(Time.zero);

    // move -> menu -> move -> menu, interleaved: the second move is NOT
    // adjacent to the first in the global order (a menu entry sits between
    // them), so it must NOT coalesce into the first either.
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 11, clientY: 10, isPrimary: true });
    fireContextMenu(canvas, 50, 50);
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 12, clientY: 10, isPrimary: true });
    fireContextMenu(canvas, 60, 60);
    input.preUpdate(Time.zero);

    expect(calls).toEqual(['move:1', 'menu:50,50', 'move:1', 'menu:60,60']);

    input.destroy();
  });

  test('two context-menu requests in the same frame BOTH survive as separate entries — never a single overwritable slot', () => {
    const { input, canvas } = createHarness();
    const seen: Array<{ x: number; y: number }> = [];

    input.onContextMenu.add(request => seen.push({ x: request.x, y: request.y }));

    fireContextMenu(canvas, 10, 10);
    fireContextMenu(canvas, 20, 20);
    input.preUpdate(Time.zero);

    // The old single-slot design would only ever see the SECOND request -
    // the first is silently lost with no signal ever firing for it.
    expect(seen).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);

    input.destroy();
  });

  test('a pointerless context-menu request interleaves correctly, carrying pointer: null, before any pointer has ever been tracked', () => {
    const { input, canvas } = createHarness();
    const calls: string[] = [];

    input.onContextMenu.add(request => calls.push(`menu:${request.pointer === null ? 'null' : request.pointer.id}`));
    input.onPointerDown.add(pointer => calls.push(`down:${pointer.id}`));

    fireContextMenu(canvas, 5, 5);
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    input.preUpdate(Time.zero);

    expect(calls).toEqual(['menu:null', 'down:1']);

    input.destroy();
  });

  test('a context-menu request attributed to a pointer whose terminal Leave arrived earlier the SAME flush still receives a live, not-yet-retired Pointer (invariants 6 & 7)', () => {
    const { input, canvas } = createHarness();
    const pointers = (input as unknown as { pointers: Map<number, Pointer> }).pointers;

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    input.preUpdate(Time.zero);

    const pointer = pointers.get(1)!;
    const destroySpy = vi.spyOn(pointer, 'destroy');
    let wasAlreadyDestroyedWhenMenuFired: boolean | null = null;
    let receivedPointer: Pointer | null = null;

    input.onContextMenu.add(request => {
      receivedPointer = request.pointer;
      wasAlreadyDestroyedWhenMenuFired = destroySpy.mock.calls.length > 0;
    });

    // The terminal Leave arrives FIRST, then the context-menu request arrives
    // AFTER it in the same flush - the ordering under test.
    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fireContextMenu(canvas, 12, 12);
    input.preUpdate(Time.zero);

    expect(receivedPointer).toBe(pointer);
    expect(wasAlreadyDestroyedWhenMenuFired).toBe(false);
    // InputManager's OWN journal drain only flags the pointer as PENDING
    // retirement now - InteractionManager still owns queued node-level
    // events (e.g. app-level onContextMenu subscribers aside, a real node's
    // onContextMenu handler) that reference this same Pointer, and those only
    // dispatch in ITS pass, which runs strictly after this input.preUpdate().
    expect(destroySpy).not.toHaveBeenCalled();
    expect(pointers.has(1)).toBe(true);

    // Only once the interaction-dispatch boundary has been explicitly closed
    // does retirement actually run.
    input._finishInteractionFrame();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(pointers.has(1)).toBe(false);

    input.destroy();
  });
});

// ---------------------------------------------------------------------------
// Bug C - InteractionManager preserves the SAME global order internally
// ---------------------------------------------------------------------------

describe('InteractionManager — cross-pointer order preserved end-to-end (Bug C)', () => {
  test("scene-node dispatch order mirrors InputManager's true cross-pointer arrival order: P1 Down -> P2 Down -> P1 Up", () => {
    const h = createHarness();
    const { canvas, scene } = h;
    const spriteA = new TestSprite().setBounds(0, 0, 50, 50);
    const spriteB = new TestSprite().setBounds(100, 0, 50, 50);

    spriteA.interactive = true;
    spriteB.interactive = true;
    scene.addChild(spriteA);
    scene.addChild(spriteB);

    const calls: string[] = [];

    spriteA.onPointerDown.add(() => calls.push('down:A'));
    spriteA.onPointerUp.add(() => calls.push('up:A'));
    spriteB.onPointerDown.add(() => calls.push('down:B'));

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'mouse', clientX: 125, clientY: 25, isPrimary: false });
    tick(h);
    calls.length = 0;

    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 125, clientY: 25, isPrimary: false });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    // The old per-pointer-bucketed `_pending: Map<number, PointerQueue>`
    // would have produced ['down:A', 'up:A', 'down:B'] - InteractionManager
    // re-losing the same ordering InputManager had just fixed.
    expect(calls).toEqual(['down:A', 'down:B', 'up:A']);

    destroyHarness(h);
    spriteA.destroy();
    spriteB.destroy();
  });

  test('a node-level contextmenu handler after Leave in the same flush receives a live Pointer, retired only after interaction dispatch finishes', () => {
    const h = createHarness();
    const { canvas, scene, input } = h;
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const pointers = (input as unknown as { pointers: Map<number, Pointer> }).pointers;

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    const pointer = pointers.get(1)!;
    const destroySpy = vi.spyOn(pointer, 'destroy');
    let destroyedInsideHandler: boolean | null = null;

    sprite.onContextMenu.add(() => {
      destroyedInsideHandler = destroySpy.mock.calls.length > 0;
    });

    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fireContextMenu(canvas, 25, 25);
    tick(h);

    expect(destroyedInsideHandler).toBe(false);
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(pointers.has(1)).toBe(false);

    destroyHarness(h);
    sprite.destroy();
  });

  test('pointer retirement still finalizes when a node-level handler throws during interaction dispatch', () => {
    const h = createHarness();
    const { canvas, scene, input, interaction } = h;
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const pointers = (input as unknown as { pointers: Map<number, Pointer> }).pointers;

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    const pointer = pointers.get(1)!;
    const destroySpy = vi.spyOn(pointer, 'destroy');

    sprite.onContextMenu.add(() => {
      throw new Error('expected handler failure');
    });

    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fireContextMenu(canvas, 25, 25);

    input.preUpdate(Time.zero);
    try {
      interaction.preUpdate();
    } catch {
      // Expected: this focused harness lets the node handler's throw
      // propagate; Application.ts's real `try/finally` is what this test's
      // own `finally` block below stands in for.
    } finally {
      input._finishInteractionFrame();
    }

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(pointers.has(1)).toBe(false);

    destroyHarness(h);
    sprite.destroy();
  });

  test('same-id reentry synchronously during interaction dispatch revives the pointer instead of letting the finalize pass destroy it', () => {
    const h = createHarness();
    const { canvas, scene, input } = h;
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    scene.addChild(sprite);

    const pointers = (input as unknown as { pointers: Map<number, Pointer> }).pointers;

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    const pointer = pointers.get(1)!;
    const destroySpy = vi.spyOn(pointer, 'destroy');

    // The node's own onContextMenu handler - dispatched during THIS tick's
    // interaction pass for the request queued below, which resolves against
    // a fresh hit test rather than the `_lastHit` cache - synchronously
    // re-enters the SAME pointerId (a rapid leave/re-enter flicker) before
    // the retirement boundary closes.
    sprite.onContextMenu.add(() => {
      fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    });

    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fireContextMenu(canvas, 25, 25);
    tick(h);

    // Reentry revived the SAME Pointer object (no longer terminal) - the
    // finalize pass must not destroy it just because it was pending at the
    // start of the flush.
    expect(destroySpy).not.toHaveBeenCalled();
    expect(pointers.get(1)).toBe(pointer);

    destroyHarness(h);
    sprite.destroy();
  });

  test('a throwing node handler discards the failed interaction batch and leaves no stale state to replay', () => {
    const h = createHarness();
    const { canvas, scene, input, interaction } = h;
    const sprite = new TestSprite().setBounds(0, 0, 100, 100);

    sprite.interactive = true;
    sprite.draggable = true;
    scene.addChild(sprite);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    const thrower = (): void => {
      throw new Error('expected handler failure');
    };

    sprite.onPointerDown.add(thrower);

    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 60, clientY: 25, isPrimary: true });

    input.preUpdate(Time.zero);
    expect(() => interaction.preUpdate()).toThrow('expected handler failure');
    input._finishInteractionFrame();

    expect(interaction.getCapturedNodes()).toEqual([]);
    expect(interaction.getHoveredNode(1)).toBeNull();

    sprite.onPointerDown.remove(thrower);

    // A new event must not replay the failed Down/Move batch or inherit its
    // drag candidate/capture. Only this fresh context-menu occurrence fires.
    const contextMenu = vi.fn();
    sprite.onContextMenu.add(contextMenu);
    fireContextMenu(canvas, 25, 25);
    tick(h);

    expect(contextMenu).toHaveBeenCalledTimes(1);
    expect(interaction.getCapturedNodes()).toEqual([]);

    destroyHarness(h);
    sprite.destroy();
  });
});

// ---------------------------------------------------------------------------
// Bug D - a swipe must not leave a stale press-target for the NEXT cycle
// ---------------------------------------------------------------------------

describe('InteractionManager — swipe does not corrupt the next unrelated press cycle (Bug D)', () => {
  test('press+swipe on A, then a Down in empty space, then Up over A: no bogus pointertap on A', () => {
    const h = createHarness();
    const { canvas, scene } = h;
    const sprite = new TestSprite().setBounds(0, 0, 50, 50);

    // NOT draggable - this must exercise InputManager's own swipe/tap
    // classification (pointerDistanceThreshold), not drag-candidate capture.
    sprite.interactive = true;
    scene.addChild(sprite);

    const tapped = vi.fn();

    sprite.onPointerTap.add(tapped);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    // Cycle 1: press A, release far away (well past the 10px threshold) -
    // a swipe, not a tap. `onPointerTap` never fires for this cycle at all.
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 300, isPrimary: true });
    tick(h);

    expect(tapped).not.toHaveBeenCalled();

    // Cycle 2: an entirely unrelated press in EMPTY space (no hit - the old
    // code's Down handler only ever recorded a press-target when `hit !==
    // null`, so this cycle's OWN press-target stays unset/empty).
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 500, clientY: 500, isPrimary: true });
    tick(h);

    // Releasing over A now must NOT resolve to cycle 1's stale press-target.
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    expect(tapped).not.toHaveBeenCalled();

    // Control: a genuine, correlated press+release cycle on A must still tap
    // - proving the fix closes the STALE cycle specifically, not tap
    // detection in general.
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 25, clientY: 25, isPrimary: true });
    tick(h);

    expect(tapped).toHaveBeenCalledTimes(1);

    destroyHarness(h);
    sprite.destroy();
  });
});
