import type { Application } from '#core/Application';
import { Component } from '#core/Component';
import type { Stage } from '#core/Stage';
import { FocusController } from '#input/FocusController';
import { Container } from '#rendering/Container';

class Tag extends Component {}

test.each(['add', 'remove'])('a component %s during blur leaves both parent subtree counts correct', mutation => {
  const input = {
    onKeyDown: { add() {}, remove() {} },
    onKeyUp: { add() {}, remove() {} },
    onAnyGamepadButtonDown: { add() {}, remove() {} },
  };
  const focus = new FocusController({ input } as unknown as Application);
  const stage: Stage = {
    focus,
    interaction: {
      _notifyNodeAdded() {},
      _notifyNodeRemoved() {},
      _notifyInteractiveChanged() {},
      _notifyBoundsInvalidated() {},
      _notifyTransformGroupMoved() {},
    },
  };
  const tree = new Container();
  const source = new Container();
  const target = new Container();
  const moving = new Container();

  tree._setStage(stage);
  tree.addChild(source, target);
  moving.focusable = true;

  if (mutation === 'remove') {
    moving.addComponent(new Tag());
  }

  source.addChild(moving);
  focus.focus(moving);
  moving.onBlur.add(() => {
    if (mutation === 'add') {
      moving.addComponent(new Tag());
    } else {
      moving.removeComponent(Tag);
    }
  });

  try {
    target.addChild(moving);

    const count = mutation === 'add' ? 1 : 0;

    expect([tree._componentNodes, source._componentNodes, target._componentNodes, moving._componentNodes]).toEqual([
      count,
      0,
      count,
      count,
    ]);
  } finally {
    tree.destroy();
  }
});
