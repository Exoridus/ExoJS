import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import type { SceneScope } from '#core/SceneScope';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import type { ContextMenuRequest } from '#input/ContextMenuRequest';
import { FocusController } from '#input/FocusController';
import type { Gamepad } from '#input/Gamepad';
import type { GamepadButton } from '#input/GamepadButton';
import type { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { GlyphInfo } from '#rendering/text/types';

import { frameDelta } from './frame-delta';

/**
 * Shared fixture for the canvas text fields: a UI layer wired to real focus
 * and interaction managers, a deterministic glyph atlas (advance 10, ink width
 * 8, so glyph k spans [10k, 10k + 8]), and the transport-level helpers a field
 * test drives it with.
 */
const fixedGlyphInfo: GlyphInfo = { x: 0, y: 0, width: 8, height: 16, advance: 10, ascent: 13, page: 0, uvLeft: 0, uvTop: 0, uvRight: 0.01, uvBottom: 0.02 };
const mockPage = {
  texture: {
    width: 1024,
    height: 1024,
    version: 1,
    source: null,
    scaleMode: 0,
    wrapMode: 0,
    premultiplyAlpha: false,
    generateMipMap: false,
    flipY: false,
    addDestroyListener: () => mockPage.texture,
    removeDestroyListener: () => mockPage.texture,
    destroy: () => undefined,
  },
  index: 0,
  mode: 'sdf' as const,
};
const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: vi.fn(() => fixedGlyphInfo),
  pages: [mockPage] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
};
const mockPool = { getAtlas: vi.fn(() => mockAtlas) };

beforeEach(() => {
  resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool);
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();

  // Each focused field lazily creates a hidden <textarea> transport; the widget
  // only removes it on destroy(). Tests build a fresh field per case and never
  // destroy it, so clear any leftovers to keep `querySelector('textarea')`
  // pointing at the field under test.
  document.body.querySelectorAll('textarea').forEach(element => element.remove());
});

export interface Harness {
  scene: Scene;
  im: InteractionManager;
  signals: {
    onPointerEnter: Signal<[Pointer]>;
    onPointerLeave: Signal<[Pointer]>;
    onPointerDown: Signal<[Pointer, number, number]>;
    onPointerMove: Signal<[Pointer, number, number]>;
    onPointerUp: Signal<[Pointer, number, number]>;
    onPointerTap: Signal<[Pointer, number, number]>;
    onPointerCancel: Signal<[Pointer, number, number]>;
    onContextMenu: Signal<[ContextMenuRequest]>;
    onKeyDown: Signal<[number]>;
    onKeyUp: Signal<[number]>;
    onAnyGamepadButtonDown: Signal<[Gamepad, GamepadButton, number]>;
    _finishInteractionFrame(): void;
  };
}

export const createUIApp = (platform: unknown = null): Harness => {
  const canvas = document.createElement('canvas');
  const signals = {
    onPointerEnter: new Signal<[Pointer]>(),
    onPointerLeave: new Signal<[Pointer]>(),
    onPointerDown: new Signal<[Pointer, number, number]>(),
    onPointerMove: new Signal<[Pointer, number, number]>(),
    onPointerUp: new Signal<[Pointer, number, number]>(),
    onPointerTap: new Signal<[Pointer, number, number]>(),
    onPointerCancel: new Signal<[Pointer, number, number]>(),
    onContextMenu: new Signal<[ContextMenuRequest]>(),
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
    onAnyGamepadButtonDown: new Signal<[Gamepad, GamepadButton, number]>(),
    _finishInteractionFrame: (): void => undefined,
  };
  const scene = new Scene();
  const app = {
    canvas,
    platform: platform ?? new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    input: signals as unknown as InputManager,
    onFrame: new Signal<[Seconds]>(),
    focus: null as FocusController | null,
    interaction: null as InteractionManager | null,
    rendering: {
      view: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) },
      screenView: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) },
    },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active,
      _transitionGateOpen: false,
    },
  };
  const typed = app as unknown as Application;

  app.focus = new FocusController(typed);
  app.interaction = new InteractionManager(typed);
  scene._attach(typed, {} as unknown as SceneScope<void>);
  app.interaction.attachRoot(scene.root);

  return { scene, im: app.interaction, signals };
};

export const makePointer = (x: number, y: number, id = 1): Pointer => ({ id, x, y, type: 'mouse', isPrimary: true }) as unknown as Pointer;

export const press = (harness: Harness, x: number, y: number): void => {
  harness.signals.onPointerDown.dispatch(makePointer(x, y), x, y);
  harness.im.preUpdate(frameDelta);
};

/** Fire a synthetic `beforeinput` on the transport textarea the seam created. */
export const fireBeforeInput = (
  inputType: string,
  init: { data?: string; dataTransfer?: { getData: (type: string) => string } | null } = {},
): { defaultPrevented: boolean } => {
  const textarea = document.body.querySelector('textarea');

  if (textarea === null) {
    throw new Error('no transport textarea exists - the field has no seam');
  }

  const event = new Event('beforeinput', { cancelable: true, bubbles: true }) as InputEvent;

  Object.defineProperty(event, 'inputType', { value: inputType });

  if (init.data !== undefined) {
    Object.defineProperty(event, 'data', { value: init.data });
  }

  if (init.dataTransfer !== undefined) {
    Object.defineProperty(event, 'dataTransfer', { value: init.dataTransfer });
  }

  textarea.dispatchEvent(event);

  return { defaultPrevented: event.defaultPrevented };
};

export const transportTextarea = (): HTMLTextAreaElement => {
  const textarea = document.body.querySelector('textarea');

  if (textarea === null) {
    throw new Error('no transport textarea exists - the field has no seam');
  }

  return textarea as HTMLTextAreaElement;
};

export const type = (text: string): void => {
  for (const char of [...text]) {
    fireBeforeInput('insertText', { data: char });
  }
};
