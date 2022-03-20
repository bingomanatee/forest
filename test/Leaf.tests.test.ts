import { Leaf } from '../src';

// import { inspect } from 'util';

describe('Leaf', () => {
  describe('tests', () => {
    it('should restrict changes based on a test', () => {
      const numLeaf = new Leaf(0, {
        test({ next }): string | void {
          if (next % 2) return 'must be even';
        },
        debug: false,
      });

      numLeaf.next(4);
      expect(numLeaf.value).toBe(4);

      expect(() => {
        numLeaf.next(5);
      }).toThrow(/must be even/);

      expect(numLeaf.value).toBe(4);

      numLeaf.next(6);
      expect(numLeaf.value).toBe(6);
    });
  });
});
