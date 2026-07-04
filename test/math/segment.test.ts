import { Segment } from '#math/Segment';
import { Vector } from '#math/Vector';

describe('Segment', () => {
  describe('startPoint/endPoint and X/Y accessors', () => {
    test('startPoint getter/setter copies coordinates from another vector', () => {
      const segment = new Segment(0, 0, 1, 1);
      segment.startPoint = new Vector(5, 6);

      expect(segment.startX).toBe(5);
      expect(segment.startY).toBe(6);
    });

    test('endPoint getter/setter copies coordinates from another vector', () => {
      const segment = new Segment(0, 0, 1, 1);
      segment.endPoint = new Vector(7, 8);

      expect(segment.endX).toBe(7);
      expect(segment.endY).toBe(8);
    });

    test('startX/startY setters update independently', () => {
      const segment = new Segment();
      segment.startX = 3;
      segment.startY = 4;

      expect(segment.startX).toBe(3);
      expect(segment.startY).toBe(4);
    });

    test('endX/endY setters update independently', () => {
      const segment = new Segment();
      segment.endX = 9;
      segment.endY = 10;

      expect(segment.endX).toBe(9);
      expect(segment.endY).toBe(10);
    });
  });

  describe('set(), copy(), clone()', () => {
    test('set() updates both endpoints and returns this', () => {
      const segment = new Segment();
      const result = segment.set(1, 2, 3, 4);

      expect(result).toBe(segment);
      expect(segment.startX).toBe(1);
      expect(segment.startY).toBe(2);
      expect(segment.endX).toBe(3);
      expect(segment.endY).toBe(4);
    });

    test('copy() duplicates another segment state and returns this', () => {
      const source = new Segment(1, 2, 3, 4);
      const target = new Segment();
      const result = target.copy(source);

      expect(result).toBe(target);
      expect(target.equals(source)).toBe(true);
    });

    test('clone() returns a new segment with the same state', () => {
      const segment = new Segment(1, 2, 3, 4);
      const clone = segment.clone();

      expect(clone).not.toBe(segment);
      expect(clone.equals(segment)).toBe(true);
    });
  });

  describe('equals()', () => {
    test('returns true when called with no arguments', () => {
      const segment = new Segment(1, 2, 3, 4);

      expect(segment.equals()).toBe(true);
      expect(segment.equals({})).toBe(true);
    });

    test('compares each field independently', () => {
      const segment = new Segment(1, 2, 3, 4);

      expect(segment.equals({ startX: 1, startY: 2, endX: 3, endY: 4 })).toBe(true);
      expect(segment.equals({ startX: 99 })).toBe(false);
      expect(segment.equals({ startY: 99 })).toBe(false);
      expect(segment.equals({ endX: 99 })).toBe(false);
      expect(segment.equals({ endY: 99 })).toBe(false);
    });
  });

  describe('destroy()', () => {
    test('does not throw', () => {
      const segment = new Segment(0, 0, 1, 1);

      expect(() => segment.destroy()).not.toThrow();
    });
  });

  describe('static temp', () => {
    test('returns a shared scratch instance on repeated access', () => {
      const first = Segment.temp;
      const second = Segment.temp;

      expect(second).toBe(first);
    });
  });
});
