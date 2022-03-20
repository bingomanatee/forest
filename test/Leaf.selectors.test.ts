import { Leaf } from '../src';

// import { inspect } from 'util';

describe('Leaf', () => {
  describe('$', () => {
    it('should have different selector collections', () => {
      const leaf1 = new Leaf(0);
      const leaf2 = new Leaf(0);
      expect(leaf1.$ === leaf2.$).toBeFalsy();
    });

    describe('.$$', () => {
      it('should produce up to date data', () => {
        const leaf = new Leaf(
          { x: 1, y: 2, z: 3 },
          {
            debug: false,
            selectors: {
              min(value) {
                return Object.keys(value).reduce(
                  (
                    out: { name: string; value: number } | null,
                    key: string
                  ) => {
                    if (!out || value[key] > out.value) {
                      out = { name: key, value: value[key] };
                    }
                    return out;
                  },
                  null
                );
              },
            },
          }
        );

        expect(leaf.$$.get('$min')).toEqual({ name: 'z', value: 3 });
      });
    });
  });
});
