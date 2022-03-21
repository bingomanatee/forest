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
              max(value) {
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

        expect(leaf.$$.get('$max')).toEqual({ name: 'z', value: 3 });

        leaf.do.setX(4);

        expect(leaf.$$.get('$max')).toEqual({ name: 'x', value: 4 });
      });
    });
  });

  it('should reflect selectors', () => {
    const leaf = new Leaf(
      { x: 1, y: 2, z: 3 },
      {
        debug: false,
        selectors: {
          max(value) {
            return Object.keys(value).reduce(
              (out: { name: string; value: number } | null, key: string) => {
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

    let current = null;
    leaf.subscribe(v => (current = v));

    expect(current).toEqual({
      x: 1,
      y: 2,
      z: 3,
      $max: { name: 'z', value: 3 },
    });
    leaf.do.setX(4);

    expect(current).toEqual({
      x: 4,
      y: 2,
      z: 3,
      $max: { name: 'x', value: 4 },
    });
  });

  describe('branch selectors', () => {
    function point(x, y) {
      return new Leaf(
        {
          x,
          y,
        },
        {
          selectors: {
            mag({ x, y }) {
              return Math.round(Math.sqrt(x ** 2 + y ** 2));
            },
          },
        }
      );
    }
    const box = new Leaf(
      {},
      {
        branches: {
          topLeft: point(0, 10),
          bottomRight: point(20, 0),
        },
      }
    );

    expect(box.value).toEqual({
      topLeft: { x: 0, y: 10, $mag: 10 },
      bottomRight: { x: 20, y: 0, $mag: 20 },
    });

    box.next({ topLeft: { x: 7, y: 15 } });

    expect(box.value).toEqual({
      topLeft: { x: 7, y: 15, $mag: 17 },
      bottomRight: { x: 20, y: 0, $mag: 20 },
    });
  });
});
