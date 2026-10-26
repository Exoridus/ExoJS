import { Rectangle } from '#math/Rectangle';
import { CrtFilter } from '#rendering/filters/CrtFilter';
import { RenderNode } from '#rendering/RenderNode';

class CountingNode extends RenderNode {
  public invalidations = 0;

  public override invalidateCache(): this {
    this.invalidations++;

    return super.invalidateCache();
  }
}

describe('CrtFilter', () => {
  test('uses the retro display defaults without expanding capture bounds', () => {
    const filter = new CrtFilter();
    const output = new Rectangle();
    filter.getOutputBounds(new Rectangle(10, 20, 64, 48), output);

    expect(filter.strength).toBe(0.8);
    expect(filter.rgbSeparation).toBe(0.006);
    expect(filter.time).toBe(0);
    expect(output).toMatchObject({ x: 10, y: 20, width: 64, height: 48 });
    filter.destroy();
  });

  test('clamps normalized strength and nonnegative separation/time at construction and assignment', () => {
    const filter = new CrtFilter({ strength: -1, rgbSeparation: -0.1, time: -1 });

    expect([filter.strength, filter.rgbSeparation, filter.time]).toEqual([0, 0, 0]);
    filter.strength = 2;
    filter.rgbSeparation = 0.05;
    filter.time = 1.25;
    expect([filter.strength, filter.rgbSeparation, filter.time]).toEqual([1, 0.05, 1.25]);
    filter.destroy();
  });

  test('invalidates every owner on visible changes and skips unchanged values', () => {
    const filter = new CrtFilter();
    const first = new CountingNode();
    const second = new CountingNode();
    first.addFilter(filter);
    second.addFilter(filter);
    const before = [first.invalidations, second.invalidations];

    filter.strength = 0.3;
    filter.rgbSeparation = 0.02;
    filter.time = 1;
    expect([first.invalidations, second.invalidations]).toEqual(before.map(value => value + 3));
    filter.strength = 0.3;
    filter.rgbSeparation = 0.02;
    filter.time = 1;
    expect([first.invalidations, second.invalidations]).toEqual(before.map(value => value + 3));
    first.removeFilter(filter);
    const detached = first.invalidations;
    filter.time = 2;
    expect(first.invalidations).toBe(detached);
    expect(second.invalidations).toBe(before[1]! + 4);
    second.removeFilter(filter);
    first.destroy();
    second.destroy();
    filter.destroy();
  });
});
