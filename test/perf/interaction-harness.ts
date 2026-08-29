/**
 * Node-side interaction benchmark harness.
 *
 * Wires the real {@link InputSystem} + {@link InteractionSystem} to a fake,
 * DOM-free {@link PlatformAdapter} - the same seam `BrowserPlatform`
 * implements - so synthetic pointer events travel through the exact
 * `platform.onSurfaceEvent → InputSystem → onPointer* signal →
 * InteractionSystem` pipeline a live `Application` uses. Hit-testing is
 * therefore exercised through the real `InteractionSystem` code (whichever
 * of `_hitTestNode`/`_hitTestIndexed` it actually picks), never a hand-copied
 * stand-in.
 *
 * No jsdom/browser globals are touched, so this runs under plain Node via
 * `tsx` - mirroring the "real engine object + fake platform, no real
 * GPU/DOM" pattern `test/perf/rendering/harness.ts` uses for the render
 * backend.
 *
 * @internal Test/perf-only.
 */

import type { Application } from '../../src/core/Application';
import { Scene } from '../../src/core/Scene';
import { SceneState } from '../../src/core/SceneState';
import type { BrowserGamepad } from '../../src/input/GamepadDefinitions';
import { InputSystem } from '../../src/input/InputSystem';
import { InteractionSystem } from '../../src/input/InteractionSystem';
import type { ScopeToken } from '../../src/input/ScopeToken';
import type {
  PlatformAdapter,
  PlatformListenerOptions,
  PlatformSubscription,
  PlatformSurfaceEventMap,
  PlatformSurfaceMetrics,
  PlatformWindowEventMap,
} from '../../src/platform/PlatformAdapter';
import type { RenderNode } from '../../src/rendering/RenderNode';

type SurfaceListener = (event: never) => void;
type WindowListener = (event: never) => void;

/**
 * Minimal {@link PlatformAdapter} with zero DOM dependency. `onSurfaceEvent`/
 * `onWindowEvent` just record listeners in a map;
 * {@link FakePlatformAdapter.dispatchSurfaceEvent} invokes them directly -
 * exactly what a real platform does when the OS delivers an event, minus the
 * actual OS (and without needing a real `HTMLCanvasElement`, which plain
 * Node does not have).
 */
class FakePlatformAdapter implements PlatformAdapter {
  public surfaceFocused = false;
  public readonly documentVisible = true;
  public readonly networkHint = 'online' as const;
  private readonly _metrics: PlatformSurfaceMetrics;
  private readonly _surfaceListeners = new Map<string, SurfaceListener[]>();
  private readonly _windowListeners = new Map<string, WindowListener[]>();

  public constructor(metrics: PlatformSurfaceMetrics) {
    this._metrics = metrics;
  }

  public focusSurface(): void {
    this.surfaceFocused = true;
  }

  public createTextInput(): null {
    return null;
  }

  public getSurfaceMetrics(): PlatformSurfaceMetrics {
    return this._metrics;
  }

  public setCursor(): void {
    /* no host cursor to set */
  }

  public setTouchAction(): void {
    /* no host touch-action to set */
  }

  public capturePointer(): void {
    /* no host pointer capture to route */
  }

  public releasePointer(): void {
    /* no host pointer capture to release */
  }

  public pollGamepads(): ReadonlyArray<BrowserGamepad | null> {
    return [];
  }

  public onVisibilityChange(): PlatformSubscription {
    return () => undefined;
  }

  public onNetworkHintChange(): PlatformSubscription {
    return () => undefined;
  }

  public now(): number {
    return 0;
  }

  public requestFrame(): number {
    return 0;
  }

  public cancelFrame(): void {
    /* nothing scheduled */
  }

  public onSurfaceEvent<K extends keyof PlatformSurfaceEventMap>(
    type: K,
    listener: (event: PlatformSurfaceEventMap[K]) => void,
    _options?: PlatformListenerOptions,
  ): PlatformSubscription {
    const list = this._surfaceListeners.get(type) ?? [];

    list.push(listener as SurfaceListener);
    this._surfaceListeners.set(type, list);

    return () => {
      const index = list.indexOf(listener as SurfaceListener);

      if (index !== -1) {
        list.splice(index, 1);
      }
    };
  }

  public onWindowEvent<K extends keyof PlatformWindowEventMap>(
    type: K,
    listener: (event: PlatformWindowEventMap[K]) => void,
    _options?: PlatformListenerOptions,
  ): PlatformSubscription {
    const list = this._windowListeners.get(type) ?? [];

    list.push(listener as WindowListener);
    this._windowListeners.set(type, list);

    return () => {
      const index = list.indexOf(listener as WindowListener);

      if (index !== -1) {
        list.splice(index, 1);
      }
    };
  }

  public destroy(): void {
    this._surfaceListeners.clear();
    this._windowListeners.clear();
  }

  /** Invoke every listener registered for `type` - simulates the platform delivering a native surface event. */
  public dispatchSurfaceEvent<K extends keyof PlatformSurfaceEventMap>(type: K, event: PlatformSurfaceEventMap[K]): void {
    for (const listener of this._surfaceListeners.get(type) ?? []) {
      (listener as (event: PlatformSurfaceEventMap[K]) => void)(event);
    }
  }
}

/** Fields the real InputSystem/Pointer pipeline actually reads off a pointer event - see {@link Pointer}'s constructor. */
export interface FakePointerInit {
  readonly clientX: number;
  readonly clientY: number;
  readonly buttons?: number;
  readonly pointerId?: number;
  readonly isPrimary?: boolean;
}

const buildPointerEvent = (init: FakePointerInit): PlatformSurfaceEventMap['pointerdown'] => {
  const buttons = init.buttons ?? 0;
  const event = {
    pointerId: init.pointerId ?? 1,
    pointerType: 'mouse',
    clientX: init.clientX,
    clientY: init.clientY,
    width: 1,
    height: 1,
    tiltX: 0,
    tiltY: 0,
    buttons,
    pressure: buttons !== 0 ? 0.5 : 0,
    twist: 0,
    isPrimary: init.isPrimary ?? true,
    button: 0,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    stopImmediatePropagation: () => undefined,
  };

  return event as unknown as PlatformSurfaceEventMap['pointerdown'];
};

export type FakePointerEventType = 'pointerover' | 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave' | 'pointercancel';

export interface InteractionHarness {
  readonly app: Application;
  readonly scene: Scene;
  readonly input: InputSystem;
  readonly interaction: InteractionSystem;
  /** Enqueue a synthetic pointer event, mirroring a real `platform.onSurfaceEvent('pointer*', ...)` delivery. */
  firePointer(type: FakePointerEventType, init: FakePointerInit): void;
  /** Drain the queued platform events through the real InputSystem → InteractionSystem pipeline, exactly as one `Application` frame does. */
  flush(): void;
  /** Confine hit-testing to `root`'s subtree - see {@link InteractionSystem.pushScope}. */
  pushScope(root: RenderNode): ScopeToken;
  /** Release a scope pushed via {@link InteractionHarness.pushScope}. */
  popScope(token: ScopeToken): void;
  destroy(): void;
}

export interface InteractionHarnessOptions {
  readonly width?: number;
  readonly height?: number;
  readonly dragThreshold?: number;
}

/**
 * Build a real InputSystem + InteractionSystem pair wired to a fake
 * DOM-free PlatformAdapter and a bare Scene - the same real pipeline
 * `Application` wires, without needing a real canvas/`HTMLCanvasElement`.
 */
export const createInteractionHarness = (options: InteractionHarnessOptions = {}): InteractionHarness => {
  const width = options.width ?? 1000;
  const height = options.height ?? 625;
  const platform = new FakePlatformAdapter({ left: 0, top: 0, width, height, backingWidth: width, backingHeight: height });
  const scene = new Scene();
  const identityView = { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) };

  const app = {
    platform,
    options: { input: options.dragThreshold === undefined ? {} : { dragThreshold: options.dragThreshold } },
    rendering: { view: identityView, screenView: identityView },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
    _backingStoreToLogical: (x: number, y: number): { x: number; y: number } => ({ x, y }),
  } as unknown as Application;

  const input = new InputSystem(app);

  (app as unknown as { input: InputSystem }).input = input;

  const interaction = new InteractionSystem(app);

  interaction.attachRoot(scene.root);

  return {
    app,
    scene,
    input,
    interaction,
    firePointer(type, init) {
      platform.dispatchSurfaceEvent(type, buildPointerEvent(init));
    },
    flush() {
      input.preUpdate(0 as never);
      interaction.preUpdate(0 as never);
    },
    pushScope(root) {
      return interaction.pushScope(root);
    },
    popScope(token) {
      interaction.popScope(token);
    },
    destroy() {
      interaction.destroy();
      input.destroy();
      platform.destroy();
    },
  };
};
