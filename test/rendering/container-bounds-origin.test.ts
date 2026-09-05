import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RetainedContainer } from '#rendering/RetainedContainer';

/** A 100x100 local-space box, so a container has a nontrivial extent to aggregate. */
class SizedDrawable extends Drawable {
  public override updateBounds(): this {
    this.setLocalBounds(0, 0, 100, 100);

    return super.updateBounds();
  }

  public override render(_backend: RenderBackend): this {
    return this;
  }
}

describe('Container bounds do not pin the origin', () => {
  test('a purely structural container spans only its children', () => {
    const container = new Container();
    const child = new SizedDrawable();

    child.setPosition(500, 400);
    container.addChild(child);

    const bounds = container.getBounds();

    // Merging the container's own empty 0x0 local rect would stretch the
    // aggregate from (0, 0) all the way to the child, reporting 600x500.
    expect(bounds.left).toBe(500);
    expect(bounds.top).toBe(400);
    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(100);

    container.destroy();
  });

  test('a structural container with several far-away children unions only them', () => {
    const container = new Container();
    const first = new SizedDrawable();
    const second = new SizedDrawable();

    first.setPosition(500, 400);
    second.setPosition(700, 300);
    container.addChild(first, second);

    const bounds = container.getBounds();

    expect(bounds.left).toBe(500);
    expect(bounds.top).toBe(300);
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(200);

    container.destroy();
  });

  test('an invisible child leaves the aggregate to its visible siblings', () => {
    const container = new Container();
    const visible = new SizedDrawable();
    const hidden = new SizedDrawable();

    visible.setPosition(500, 400);
    hidden.setPosition(0, 0);
    hidden.visible = false;
    container.addChild(visible, hidden);

    const bounds = container.getBounds();

    expect(bounds.left).toBe(500);
    expect(bounds.top).toBe(400);

    container.destroy();
  });

  test('an empty container still reports a degenerate rect at its own position', () => {
    const container = new Container();

    container.setPosition(120, 60);

    const bounds = container.getBounds();

    // No content at all: the aggregate must stay a real (degenerate) rect at
    // the container's own transform rather than collapsing to the empty
    // Infinity/-Infinity accumulator, which would poison width/height.
    expect(bounds.left).toBe(120);
    expect(bounds.top).toBe(60);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);

    container.destroy();
  });

  test('a container whose children are all invisible falls back to its own position', () => {
    const container = new Container();
    const hidden = new SizedDrawable();

    hidden.setPosition(500, 400);
    hidden.visible = false;
    container.setPosition(120, 60);
    container.addChild(hidden);

    const bounds = container.getBounds();

    expect(bounds.left).toBe(120);
    expect(bounds.top).toBe(60);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);

    container.destroy();
  });

  test('RetainedContainer aggregates its children without pinning the origin', () => {
    const container = new RetainedContainer();
    const child = new SizedDrawable();

    child.setPosition(500, 400);
    container.addChild(child);

    const bounds = container.getBounds();

    expect(bounds.left).toBe(500);
    expect(bounds.top).toBe(400);
    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(100);

    container.destroy();
  });
});
