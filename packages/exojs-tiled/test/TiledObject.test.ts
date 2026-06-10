import { describe, expect, it } from 'vitest';

import { TiledObject } from '../src/TiledObject';

const base = {
  id: 1,
  name: 'thing',
  type: 'Enemy',
  x: 10,
  y: 20,
  width: 16,
  height: 16,
  rotation: 45,
  visible: true,
};

describe('TiledObject', () => {
  it('maps all base fields from data', () => {
    const obj = new TiledObject({ ...base });
    expect(obj.id).toBe(1);
    expect(obj.name).toBe('thing');
    expect(obj.type).toBe('Enemy');
    expect(obj.x).toBe(10);
    expect(obj.y).toBe(20);
    expect(obj.width).toBe(16);
    expect(obj.height).toBe(16);
    expect(obj.rotation).toBe(45);
    expect(obj.visible).toBe(true);
  });

  it('defaults point and ellipse to false when absent', () => {
    const obj = new TiledObject({ ...base });
    expect(obj.point).toBe(false);
    expect(obj.ellipse).toBe(false);
  });

  it('maps the point flag', () => {
    expect(new TiledObject({ ...base, point: true }).point).toBe(true);
  });

  it('maps the ellipse flag', () => {
    expect(new TiledObject({ ...base, ellipse: true }).ellipse).toBe(true);
  });

  it('maps polygon point array', () => {
    const pts = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }];
    expect(new TiledObject({ ...base, polygon: pts }).polygon).toEqual(pts);
  });

  it('maps polyline point array', () => {
    const pts = [{ x: 0, y: 0 }, { x: 16, y: 16 }];
    expect(new TiledObject({ ...base, polyline: pts }).polyline).toEqual(pts);
  });

  it('maps text object data', () => {
    const text = { text: 'Hello', halign: 'center' as const };
    expect(new TiledObject({ ...base, text }).text).toEqual(text);
  });

  it('maps gid (tile object reference)', () => {
    expect(new TiledObject({ ...base, gid: 7 }).gid).toBe(7);
  });

  it('maps template path', () => {
    expect(new TiledObject({ ...base, template: 'templates/tree.tx' }).template).toBe('templates/tree.tx');
  });

  it('maps properties array', () => {
    const properties = [{ name: 'hp', type: 'int' as const, value: 10, propertytype: undefined }];
    expect(new TiledObject({ ...base, properties }).properties).toEqual(properties);
  });

  it('defaults properties to empty array when absent', () => {
    expect(new TiledObject({ ...base }).properties).toEqual([]);
  });

  describe('getProperty', () => {
    const obj = new TiledObject({
      ...base,
      properties: [
        { name: 'hp', type: 'int', value: 5, propertytype: undefined },
        { name: 'name', type: 'string', value: 'orc', propertytype: undefined },
      ],
    });

    it('returns the property with matching name', () => {
      expect(obj.getProperty('hp')).toEqual({ name: 'hp', type: 'int', value: 5, propertytype: undefined });
    });

    it('returns undefined for an unknown name', () => {
      expect(obj.getProperty('missing')).toBeUndefined();
    });
  });
});
