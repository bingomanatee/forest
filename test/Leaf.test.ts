import { Leaf } from '../src';

describe('Leaf', () => {
  describe('constructor', () => {
    it('has the right value', () => {
      const l = new Leaf(3);
      expect(l.value).toBe(3);
      expect(l.version).toBe(0);
    });
  });

  describe('#value', () => {
    it('should update value and version', () => {
      const l = new Leaf(3);
      l.value = 6;
      expect(l.value).toBe(6);
      expect(l.version).toBe(1);
    });
  });

  describe('branches', () => {
    describe('(object)', () => {
      const point = new Leaf(new Object(), {
        branches: {
          x: 0,
          y: 0,
          z: 0,
        },
      });
      point.branch('x').value = 3;
      expect(point.value).toEqual({ x: 3, y: 0, z: 0 });
      expect(point.version).toBe(4);

      point.branch('y').value = 6;
      expect(point.value).toEqual({ x: 3, y: 6, z: 0 });
      expect(point.version).toBe(5);
    });
  });
});
