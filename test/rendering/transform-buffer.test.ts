import { Color } from '@/core/Color';
import { Matrix } from '@/math/Matrix';
import { Container } from '@/rendering/Container';
import { Sprite } from '@/rendering/sprite/Sprite';
import { Texture } from '@/rendering/texture/Texture';
import { TransformBuffer } from '@/rendering/TransformBuffer';

describe('TransformBuffer', () => {
  test('stores transform rows and normalized tint at the requested slot', () => {
    const buffer = new TransformBuffer();
    const transform = new Matrix(2, 3, 11, 5, 7, 13, 0, 0, 1);
    const tint = new Color(64, 128, 255, 0.5);

    buffer.begin();
    buffer.write(0, transform, tint);

    const data = buffer.data;

    expect(buffer.count).toBe(1);
    expect(data[0]).toBe(2);
    expect(data[1]).toBe(3);
    expect(data[2]).toBe(5);
    expect(data[3]).toBe(7);
    expect(data[4]).toBe(11);
    expect(data[5]).toBe(13);
    expect(data[6]).toBe(0);
    expect(data[7]).toBe(0);
    expect(data[8]).toBeCloseTo(64 / 255, 6);
    expect(data[9]).toBeCloseTo(128 / 255, 6);
    expect(data[10]).toBeCloseTo(1, 6);
    expect(data[11]).toBeCloseTo(0.5, 6);
  });

  test('sparse nodeIndex writes keep the highest slot as frame count', () => {
    const buffer = new TransformBuffer();
    const identity = new Matrix();

    buffer.begin();
    buffer.write(3, identity, Color.white);

    expect(buffer.count).toBe(4);
  });

  test('commit snapshot is stable across identical frames', () => {
    const buffer = new TransformBuffer();
    const transform = new Matrix(1, 2, 3, 4, 5, 6, 0, 0, 1);
    const tint = new Color(10, 20, 30, 0.75);

    buffer.begin();
    buffer.write(0, transform, tint);
    const first = buffer.commitSnapshot();

    buffer.begin();
    buffer.write(0, transform, tint);
    const second = buffer.commitSnapshot();

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(first.hash).toBe(second.hash);
    expect(first.count).toBe(second.count);
  });

  test('grows capacity when writing beyond the current slot range', () => {
    const buffer = new TransformBuffer();
    const identity = new Matrix();

    buffer.begin();
    buffer.write(64, identity, Color.white);

    expect(buffer.capacity).toBeGreaterThanOrEqual(65);
    expect(buffer.count).toBe(65);
  });

  test('matches nested getGlobalTransform output including skew and anchor semantics', () => {
    const buffer = new TransformBuffer();
    const parent = new Container();
    const child = new Sprite(Texture.white);

    parent.setPosition(32, -12).setScale(1.25, 0.75).setRotation(18).setSkew(7, -5);
    child.setPosition(11, 9).setScale(1.5, 0.5).setRotation(-22).setSkew(-3, 4).setAnchor(0.5, 0.25);
    child.setTint(new Color(40, 100, 220, 0.6));
    parent.addChild(child);

    const global = child.getGlobalTransform();
    const slot = 7;

    buffer.begin();
    buffer.write(slot, global, child.tint);

    const offset = slot * 12;
    const data = buffer.data;

    expect(buffer.count).toBe(8);
    expect(data[offset + 0]).toBeCloseTo(global.a, 5);
    expect(data[offset + 1]).toBeCloseTo(global.b, 5);
    expect(data[offset + 2]).toBeCloseTo(global.c, 5);
    expect(data[offset + 3]).toBeCloseTo(global.d, 5);
    expect(data[offset + 4]).toBeCloseTo(global.x, 5);
    expect(data[offset + 5]).toBeCloseTo(global.y, 5);
    expect(data[offset + 8]).toBeCloseTo(child.tint.r / 255, 6);
    expect(data[offset + 9]).toBeCloseTo(child.tint.g / 255, 6);
    expect(data[offset + 10]).toBeCloseTo(child.tint.b / 255, 6);
    expect(data[offset + 11]).toBeCloseTo(child.tint.a, 6);

    parent.destroy();
  });
});
