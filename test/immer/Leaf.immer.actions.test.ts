import { LeafImmer } from '../../src';

// import { inspect } from 'util';

describe('LeafImmer', () => {
  describe('actions', () => {
    it('should make setters for initial props', () => {
      const point = new LeafImmer({ x: 0, y: 0, z: 0 }, {});
      point.do.setX(3);

      expect(point.value).toEqual({ x: 3, y: 0, z: 0 });

      point.do.setY(4);

      expect(point.value).toEqual({ x: 3, y: 4, z: 0 });
    });

    it('should allow custom actions', () => {
      const point = new LeafImmer(
        { x: 0, y: 0, z: 0 },
        {
          debug: false,
          actions: {
            addTo: (leaf, x, y, z) => {
              leaf.do.setX(leaf.value.x + x);
              leaf.do.setY(leaf.value.y + y);
              leaf.do.setZ(leaf.value.z + z);
            },
            length(leaf) {
              return Math.sqrt(
                leaf.value.x ** 2 + leaf.value.y ** 2 + leaf.value.z ** 2
              );
            },
          },
        }
      );

      point.do.addTo(2, 4, 6);

      expect(point.value).toEqual({ x: 2, y: 4, z: 6 });

      expect(Math.round(point.do.length())).toEqual(7);
    });
  });
});
