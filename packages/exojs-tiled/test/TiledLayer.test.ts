import { describe, expect, it } from 'vitest';

import type { TiledGroupLayerData,TiledObjectLayerData } from '../src/data';
import {
  createTiledLayer,
  TiledGroupLayer,
  TiledImageLayer,
  TiledLayer,
  TiledObjectLayer,
  TiledTileLayer,
} from '../src/TiledLayer';

const BASE = {
  id: 1,
  name: 'Layer',
  visible: true,
  opacity: 1,
  x: 0,
  y: 0,
};

describe('TiledTileLayer', () => {
  const data = { ...BASE, type: 'tilelayer' as const, width: 4, height: 4, data: [1, 2, 3, 4] };

  it('has type "tilelayer"', () => {
    expect(new TiledTileLayer(data).type).toBe('tilelayer');
  });

  it('maps width and height', () => {
    const layer = new TiledTileLayer(data);
    expect(layer.width).toBe(4);
    expect(layer.height).toBe(4);
  });

  it('maps finite data array', () => {
    expect(new TiledTileLayer(data).data).toEqual([1, 2, 3, 4]);
  });

  it('maps infinite chunks array', () => {
    const chunks = [{ x: 0, y: 0, width: 16, height: 16, data: [1, 2] }];
    const layer = new TiledTileLayer({ ...BASE, type: 'tilelayer' as const, width: 0, height: 0, chunks });
    expect(layer.chunks).toEqual(chunks);
    expect(layer.data).toBeUndefined();
  });
});

describe('TiledObjectLayer', () => {
  const objectData = { id: 1, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true };
  const data: TiledObjectLayerData = { ...BASE, type: 'objectgroup', objects: [objectData] };

  it('has type "objectgroup"', () => {
    expect(new TiledObjectLayer(data).type).toBe('objectgroup');
  });

  it('defaults drawOrder to "topdown"', () => {
    expect(new TiledObjectLayer(data).drawOrder).toBe('topdown');
  });

  it('maps explicit drawOrder', () => {
    expect(new TiledObjectLayer({ ...data, draworder: 'index' }).drawOrder).toBe('index');
  });

  it('maps objects as TiledObject instances', () => {
    const layer = new TiledObjectLayer(data);
    expect(layer.objects).toHaveLength(1);
    expect(layer.objects[0].id).toBe(1);
  });
});

describe('TiledImageLayer', () => {
  const data = { ...BASE, type: 'imagelayer' as const, image: 'bg.png' };

  it('has type "imagelayer"', () => {
    expect(new TiledImageLayer(data).type).toBe('imagelayer');
  });

  it('maps image path', () => {
    expect(new TiledImageLayer(data).image).toBe('bg.png');
  });

  it('defaults repeatX and repeatY to false', () => {
    const layer = new TiledImageLayer(data);
    expect(layer.repeatX).toBe(false);
    expect(layer.repeatY).toBe(false);
  });

  it('maps explicit repeat flags', () => {
    const layer = new TiledImageLayer({ ...data, repeatx: true, repeaty: true });
    expect(layer.repeatX).toBe(true);
    expect(layer.repeatY).toBe(true);
  });
});

describe('TiledGroupLayer', () => {
  const childData = { ...BASE, id: 2, type: 'tilelayer' as const, width: 1, height: 1, data: [0] };
  const data: TiledGroupLayerData = { ...BASE, type: 'group', layers: [childData] };

  it('has type "group"', () => {
    expect(new TiledGroupLayer(data).type).toBe('group');
  });

  it('recursively constructs child layers', () => {
    const group = new TiledGroupLayer(data);
    expect(group.layers).toHaveLength(1);
    expect(group.layers[0]).toBeInstanceOf(TiledTileLayer);
    expect(group.layers[0].id).toBe(2);
  });
});

describe('TiledLayer base fields', () => {
  const data = {
    ...BASE,
    type: 'tilelayer' as const,
    width: 1,
    height: 1,
    data: [0],
    class: 'background',
    offsetx: 4,
    offsety: 8,
    parallaxx: 0.5,
    parallaxy: 0.75,
    tintcolor: '#ff0000',
    properties: [{ name: 'z', type: 'int' as const, value: 5, propertytype: undefined }],
  };

  it('maps class', () => expect(new TiledTileLayer(data).class).toBe('background'));
  it('maps offsetX / offsetY', () => {
    const layer = new TiledTileLayer(data);
    expect(layer.offsetX).toBe(4);
    expect(layer.offsetY).toBe(8);
  });
  it('maps parallaxX / parallaxY', () => {
    const layer = new TiledTileLayer(data);
    expect(layer.parallaxX).toBe(0.5);
    expect(layer.parallaxY).toBe(0.75);
  });
  it('maps tintColor', () => expect(new TiledTileLayer(data).tintColor).toBe('#ff0000'));
  it('maps properties', () => expect(new TiledTileLayer(data).properties).toHaveLength(1));

  it('defaults class to empty string', () => {
    expect(new TiledTileLayer({ ...BASE, type: 'tilelayer' as const, width: 1, height: 1, data: [0] }).class).toBe('');
  });
  it('defaults offsetX / offsetY to 0', () => {
    const layer = new TiledTileLayer({ ...BASE, type: 'tilelayer' as const, width: 1, height: 1, data: [0] });
    expect(layer.offsetX).toBe(0);
    expect(layer.offsetY).toBe(0);
  });
  it('defaults parallaxX / parallaxY to 1', () => {
    const layer = new TiledTileLayer({ ...BASE, type: 'tilelayer' as const, width: 1, height: 1, data: [0] });
    expect(layer.parallaxX).toBe(1);
    expect(layer.parallaxY).toBe(1);
  });

  describe('getProperty', () => {
    it('returns the property with matching name', () => {
      const layer = new TiledTileLayer(data);
      expect(layer.getProperty('z')).toMatchObject({ name: 'z', value: 5 });
    });

    it('returns undefined for an unknown name', () => {
      expect(new TiledTileLayer(data).getProperty('missing')).toBeUndefined();
    });
  });
});

describe('createTiledLayer factory', () => {
  it('creates TiledTileLayer for type "tilelayer"', () => {
    expect(createTiledLayer({ ...BASE, type: 'tilelayer', width: 1, height: 1, data: [0] })).toBeInstanceOf(TiledTileLayer);
  });

  it('creates TiledObjectLayer for type "objectgroup"', () => {
    expect(createTiledLayer({ ...BASE, type: 'objectgroup', objects: [] })).toBeInstanceOf(TiledObjectLayer);
  });

  it('creates TiledImageLayer for type "imagelayer"', () => {
    expect(createTiledLayer({ ...BASE, type: 'imagelayer', image: '' })).toBeInstanceOf(TiledImageLayer);
  });

  it('creates TiledGroupLayer for type "group"', () => {
    expect(createTiledLayer({ ...BASE, type: 'group', layers: [] })).toBeInstanceOf(TiledGroupLayer);
  });

  it('all layer types are instances of TiledLayer', () => {
    expect(createTiledLayer({ ...BASE, type: 'tilelayer', width: 1, height: 1, data: [0] })).toBeInstanceOf(TiledLayer);
    expect(createTiledLayer({ ...BASE, type: 'objectgroup', objects: [] })).toBeInstanceOf(TiledLayer);
    expect(createTiledLayer({ ...BASE, type: 'imagelayer', image: '' })).toBeInstanceOf(TiledLayer);
    expect(createTiledLayer({ ...BASE, type: 'group', layers: [] })).toBeInstanceOf(TiledLayer);
  });
});
