/**
 * Mutable effect state and the nodes that consume it.
 *
 * Attaching a filter has always invalidated the owning node; mutating one after
 * attachment did not, so a cached or retained representation kept replaying the
 * output the filter produced before the change. These cells pin the
 * notification, its attachment lifecycle and its behaviour under sharing.
 */

import { Color } from '#core/Color';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorFilter } from '#rendering/filters/ColorFilter';
import { Filter } from '#rendering/filters/Filter';
import { WebGl2ShaderFilter } from '#rendering/filters/WebGl2ShaderFilter';
import { WebGpuShaderFilter } from '#rendering/filters/WebGpuShaderFilter';
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

describe('every stock filter owns its own invalidation', () => {
  test('a shader filter uniform written through setUniform notifies the owner', () => {
    const node = new CountingNode();
    const filter = new WebGl2ShaderFilter({ fragmentSource: 'void main() {}', uniforms: { uTime: 0 } });

    node.addFilter(filter);

    const afterAttach = node.invalidations;

    filter.setUniform('uTime', 1.5);

    expect(filter.uniforms['uTime']).toBe(1.5);
    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('setUniforms notifies once for a whole batch', () => {
    const node = new CountingNode();
    const filter = new WebGl2ShaderFilter({ fragmentSource: 'void main() {}', uniforms: { uTime: 0, uStrength: 0 } });

    node.addFilter(filter);

    const afterAttach = node.invalidations;

    filter.setUniforms({ uTime: 2, uStrength: 0.5 });

    expect(filter.uniforms['uTime']).toBe(2);
    expect(filter.uniforms['uStrength']).toBe(0.5);
    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('the WebGPU shader filter carries the same contract', () => {
    const node = new CountingNode();
    const filter = new WebGpuShaderFilter({ fragmentSource: 'void main() {}', uniforms: { uTime: 0 } });

    node.addFilter(filter);

    const afterAttach = node.invalidations;

    filter.setUniform('uTime', 3);

    expect(filter.uniforms['uTime']).toBe(3);
    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('assigning a colour to a ColorFilter notifies the owner', () => {
    const node = new CountingNode();
    const filter = new ColorFilter(Color.white);

    node.addFilter(filter);

    const afterAttach = node.invalidations;

    filter.color = new Color(255, 0, 0);

    expect(filter.color.equals({ r: 255, g: 0, b: 0 })).toBe(true);
    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('assigning the colour it already has notifies nobody', () => {
    const node = new CountingNode();
    const filter = new ColorFilter(new Color(10, 20, 30, 1));

    node.addFilter(filter);

    const afterAttach = node.invalidations;

    filter.color = new Color(10, 20, 30, 1);

    expect(node.invalidations).toBe(afterAttach);
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
