import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneState } from '#core/scene/SceneState';
import type { InteractionHooks } from '#core/Stage';
import { Time } from '#core/units';
import { FocusController } from '#input/FocusController';
import { InputSystem } from '#input/InputSystem';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { Container } from '#rendering/Container';

const interaction: InteractionHooks = {
  _notifyNodeAdded() {},
  _notifyNodeRemoved() {},
  _notifyInteractiveChanged() {},
  _notifyBoundsInvalidated() {},
  _notifyTransformGroupMoved() {},
};

describe('journaled keyboard focus modifiers', () => {
  it.each([
    ['released Shift chord', ['+ShiftLeft', '+Tab', '-Tab', '-ShiftLeft'], 1],
    ['released Shift before plain Tab', ['+ShiftLeft', '-ShiftLeft', '+Tab', '-Tab'], 0],
    ['one Shift remains through Tab', ['+ShiftLeft', '+ShiftRight', '-ShiftLeft', '+Tab', '-Tab', '-ShiftRight'], 1],
    ['three ordered traversals', ['+Tab', '-Tab', '+ShiftLeft', '+Tab', '-Tab', '-ShiftLeft', '+Tab', '-Tab'], 0],
  ] as const)('%s in one frame', (_label, transitions, expectedIndex) => {
    const canvas = document.createElement('canvas');
    const scene = new Scene();
    const platform = new BrowserPlatform(canvas);
    const fields = {
      canvas,
      platform,
      width: 800,
      height: 600,
      pixelRatio: 1,
      options: { input: {} },
      scenes: { paused: false, currentScene: scene, state: SceneState.Active, _transitionGateOpen: false },
      input: null as unknown as InputSystem,
    };
    const app = fields as unknown as Application;
    const input = new InputSystem(app);
    fields.input = input;
    const focus = new FocusController(app);
    scene.root._setStage({ app, focus, interaction });
    const nodes = [new Container(), new Container(), new Container()];

    for (const node of nodes) {
      node.focusable = true;
      scene.root.addChild(node);
    }

    focus.focus(nodes[2]!);
    canvas.dispatchEvent(new FocusEvent('focus'));

    try {
      for (const transition of transitions) {
        window.dispatchEvent(new KeyboardEvent(transition.startsWith('+') ? 'keydown' : 'keyup', { code: transition.slice(1) }));
      }

      input.preFrame(Time.seconds(0.016));
      expect(focus.focused).toBe(nodes[expectedIndex]);
    } finally {
      scene.root.destroy();
      focus.destroy();
      input.destroy();
      platform.destroy();
    }
  });
});
