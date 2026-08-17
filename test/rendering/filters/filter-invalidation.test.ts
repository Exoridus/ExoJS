/**
 * Mutable effect state and the nodes that consume it.
 *
 * Attaching a filter has always invalidated the owning node; mutating one after
 * attachment did not, so a cached or retained representation kept replaying the
 * output the filter produced before the change. These cells pin the
 * notification, its attachment lifecycle and its behaviour under sharing.
 */

import { BlurFilter } from '#rendering/filters/BlurFilter';
import { Filter } from '#rendering/filters/Filter';
import { RenderNode } from '#rendering/RenderNode';

class CountingNode extends RenderNode {
  public invalidations = 0;

  public override invalidateCache(): this {
    this.invalidations++;

    return super.invalidateCache();
  }
}

class ProbeFilter extends Filter {
  public apply(): void {
    // no GPU work — these cells never render
  }

  public change(): void {
    this.invalidate();
  }
}

describe('a mutated filter reaches the nodes that render it', () => {
  test('a bounds-affecting mutation invalidates the owner', () => {
    const node = new CountingNode();
    const blur = new BlurFilter({ radius: 2 });

    node.addFilter(blur);

    const afterAttach = node.invalidations;

    blur.radius = 12;

    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('a visual-only mutation invalidates the owner too', () => {
    const node = new CountingNode();
    const blur = new BlurFilter({ radius: 2, quality: 1 });

    node.addFilter(blur);

    const afterAttach = node.invalidations;

    blur.quality = 4;

    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('writing a property its current value notifies nobody', () => {
    const node = new CountingNode();
    const blur = new BlurFilter({ radius: 5 });

    node.addFilter(blur);

    const afterAttach = node.invalidations;

    blur.radius = 5;
    blur.quality = 1;

    expect(node.invalidations).toBe(afterAttach);
  });

  test('the application does not have to remove and re-add the filter', () => {
    const node = new CountingNode();
    const blur = new BlurFilter({ radius: 2 });

    node.addFilter(blur);
    blur.radius = 9;

    // The filter is still attached exactly once — the invalidation came from
    // the mutation itself.
    expect(node.filters).toEqual([blur]);
  });
});

describe('attachment decides who is notified', () => {
  test('a removed filter no longer reaches its former owner', () => {
    const node = new CountingNode();
    const filter = new ProbeFilter();

    node.addFilter(filter);
    node.removeFilter(filter);

    const afterRemoval = node.invalidations;

    filter.change();

    expect(node.invalidations).toBe(afterRemoval);
  });

  test('clearFilters detaches every filter', () => {
    const node = new CountingNode();
    const first = new ProbeFilter();
    const second = new ProbeFilter();

    node.addFilter(first).addFilter(second);
    node.clearFilters();

    const afterClear = node.invalidations;

    first.change();
    second.change();

    expect(node.invalidations).toBe(afterClear);
  });

  test('assigning the filters array replaces the notification set', () => {
    const node = new CountingNode();
    const dropped = new ProbeFilter();
    const kept = new ProbeFilter();

    node.addFilter(dropped);
    node.filters = [kept];

    const afterAssign = node.invalidations;

    dropped.change();
    expect(node.invalidations).toBe(afterAssign);

    kept.change();
    expect(node.invalidations).toBe(afterAssign + 1);
  });

  test('a destroyed node is no longer notified', () => {
    const node = new CountingNode();
    const filter = new ProbeFilter();

    node.addFilter(filter);
    node.destroy();

    const afterDestroy = node.invalidations;

    filter.change();

    expect(node.invalidations).toBe(afterDestroy);
  });
});

describe('a shared filter notifies every consumer', () => {
  test('one mutation reaches both nodes', () => {
    const first = new CountingNode();
    const second = new CountingNode();
    const blur = new BlurFilter({ radius: 1 });

    first.addFilter(blur);
    second.addFilter(blur);

    const afterAttachFirst = first.invalidations;
    const afterAttachSecond = second.invalidations;

    blur.radius = 7;

    expect(first.invalidations).toBe(afterAttachFirst + 1);
    expect(second.invalidations).toBe(afterAttachSecond + 1);
  });

  test('removing one consumer leaves the other notified', () => {
    const first = new CountingNode();
    const second = new CountingNode();
    const blur = new BlurFilter({ radius: 1 });

    first.addFilter(blur);
    second.addFilter(blur);
    first.removeFilter(blur);

    const afterRemoval = first.invalidations;
    const secondBefore = second.invalidations;

    blur.radius = 7;

    expect(first.invalidations).toBe(afterRemoval);
    expect(second.invalidations).toBe(secondBefore + 1);
  });

  test('the same filter attached twice survives one removal', () => {
    const node = new CountingNode();
    const filter = new ProbeFilter();

    node.addFilter(filter).addFilter(filter);
    node.removeFilter(filter);

    const afterRemoval = node.invalidations;

    filter.change();

    // Still attached once, so still notified once.
    expect(node.invalidations).toBe(afterRemoval + 1);
  });
});
