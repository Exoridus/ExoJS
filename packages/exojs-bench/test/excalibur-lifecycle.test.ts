import { replaceExcaliburChild } from '../src/rendering/adapters/excaliburLifecycle';

interface Actor {
  readonly kill: () => void;
}

class Parent {
  readonly children = new Set<Actor>();

  addChild(child: Actor): void {
    this.children.add(child);
  }

  removeChild(child: Actor): void {
    this.children.delete(child);
  }

  hasChild(child: Actor): boolean {
    return this.children.has(child);
  }
}

describe('Excalibur lifecycle churn', () => {
  test('does not kill an actor after removing it from its parent', () => {
    const parent = new Parent();
    const current = { kill: vi.fn() };
    const replacement = { actor: { kill: vi.fn() }, text: null };

    parent.addChild(current);

    expect(replaceExcaliburChild(parent, current, () => replacement)).toBe(replacement);

    expect(parent.hasChild(current)).toBe(false);
    expect(parent.hasChild(replacement.actor)).toBe(true);
    expect(current.kill).not.toHaveBeenCalled();
  });
});
