import { Leaf } from '../src';
import { toMap } from '../src/utils';

// import { inspect } from 'util';

describe('Leaf', () => {
  describe('constructor', () => {
    it('has the right value', () => {
      const l = new Leaf(3);
      expect(l.value).toBe(3);
      expect(l.version).toBe(0);
    });
  });

  describe('form', () => {
    describe('object', () => {
      const leaf = new Leaf({ a: 1, b: 2 });

      expect(() => leaf.next([])).toThrow(/incorrect form/);

      expect(leaf.value).toEqual({ a: 1, b: 2 });
    });
  });

  describe('#value', () => {
    it('should update value and version', () => {
      const l = new Leaf(3);
      l.next(6);
      expect(l.value).toBe(6);
      expect(l.version).toBe(1);
    });
  });

  describe('containers', () => {
    it('should expand objects', () => {
      const pt = new Leaf({ x: 0, y: 0 });
      pt.next({ x: 1, z: 3 });
      expect(pt.value).toEqual({ x: 1, y: 0, z: 3 });
    });

    it('should expand maps', () => {
      const pt = new Leaf(toMap({ x: 0, y: 0 }));
      pt.next(
        new Map([
          ['x', 1],
          ['z', 3],
        ])
      );
      expect(pt.value).toEqual(
        new Map([
          ['x', 1],
          ['y', 0],
          ['z', 3],
        ])
      );
    });

    describe('#delKeys', () => {
      it('should delete object keys', () => {
        const pt = new Leaf({
          x: 0,
          y: 0,
          z: 0,
        });
        const history: any[] = [];

        pt.subscribe(value => history.push(value));

        pt.delKeys('y');
        expect(pt.value).toEqual({ x: 0, z: 0 });

        expect(() => pt.do.setY(3)).toThrow(/is not a function/);
        expect(history).toEqual([
          { x: 0, y: 0, z: 0 },
          { x: 0, z: 0 },
        ]);
      });
    });
  });

  describe('#res', () => {
    it('stores res configs', () => {
      const dataEle = new Leaf(
        { id: 100, name: 'Bob' },
        {
          res: {
            url: '/foo/bar',
          },
        }
      );
      expect(dataEle.res('url')).toBe('/foo/bar');
    });
  });

  describe('children', () => {
    describe('(object)', () => {
      it('should have consistent branch values', () => {
        const point = new Leaf(
          {},
          {
            children: {
              x: 0,
              y: 0,
              z: 0,
            },
          }
        );

        expect(point.version).toBe(0);
        expect(point.value).toEqual({ x: 0, y: 0, z: 0 });

        point.branch('x').next(3);
        expect(point.value).toEqual({ x: 3, y: 0, z: 0 });
        expect(point.version).toBe(1);

        point.branch('y').next(6);
        expect(point.value).toEqual({ x: 3, y: 6, z: 0 });
        expect(point.version).toBe(2);
      });

      it('should push changes to children', () => {
        const point = new Leaf(
          {},
          {
            children: {
              x: 0,
              y: 0,
              z: 0,
            },
          }
        );

        expect(point.branch('x').version).toBe(0);
        point.next({ x: 1, y: 4, z: 9 });

        expect(point.value).toEqual({ x: 1, y: 4, z: 9 });
        expect(point.version).toBe(1);

        expect(point.branch('x').value).toBe(1);
        expect(point.branch('x').version).toBe(1);

        expect(point.branch('y').value).toBe(4);
        expect(point.branch('y').version).toBe(1);

        expect(point.branch('z').value).toBe(9);
        expect(point.branch('z').version).toBe(1);
      });

      describe('.rollbackTo', () => {
        it('should roll back to a snapshot', () => {
          const point = new Leaf(
            {},
            {
              children: {
                x: 0,
                y: 0,
                z: 0,
              },
            }
          );

          point.branch('x').next(3);
          point.branch('y').next(6);
          point.emit('rollback', 1);

          expect(point.value).toEqual({ x: 3, y: 0, z: 0 });
          expect(point.version).toBe(1);

          expect(point.branch('y').value).toBe(0);
          expect(point.branch('y').version).toBe(0);
        });
        it('should roll forward after a rollback', () => {
          const point = new Leaf(
            {},
            {
              children: {
                x: 0,
                y: 0,
                z: 0,
              },
            }
          );

          point.branch('x').next(3);
          point.branch('y').next(6);
          point.emit('rollback', 1);
          point.branch('z').next(9);

          expect(point.value).toEqual({ x: 3, y: 0, z: 9 });
          expect(point.version).toBe(3);

          expect(point.branch('y').value).toBe(0);
          expect(point.branch('y').version).toBe(0);
        });
      });

      describe('(object - deep)', () => {
        function p(x, y, z) {
          return { x, y, z };
        }

        function makePoint(x, y, z) {
          return new Leaf(
            {},
            {
              children: p(x, y, z),
            }
          );
        }

        it('should have consistent branch values', () => {
          const box = new Leaf(
            {},
            {
              children: {
                topLeft: makePoint(0, 1, 0),
                topRight: makePoint(1, 1, 0),
                bottomLeft: makePoint(0, 0, 0),
                bottomRight: makePoint(1, 0, 0),
              },
            }
          );
          expect(box.version).toBe(0);
          expect(box.value).toEqual({
            topLeft: p(0, 1, 0),
            topRight: p(1, 1, 0),
            bottomLeft: p(0, 0, 0),
            bottomRight: p(1, 0, 0),
          });
          box.branch('topLeft.x').next(3);
          expect(box.value).toEqual({
            topLeft: p(3, 1, 0),
            topRight: p(1, 1, 0),
            bottomLeft: p(0, 0, 0),
            bottomRight: p(1, 0, 0),
          });
          expect(box.version).toBe(1);
          expect(box.branch('bottomLeft').version).toBe(0);

          box.branch('topRight.z').next(6);
          expect(box.value).toEqual({
            topLeft: p(3, 1, 0),
            topRight: p(1, 1, 6),
            bottomLeft: p(0, 0, 0),
            bottomRight: p(1, 0, 0),
          });
          expect(box.version).toBe(2);
          expect(box.branch('bottomLeft').version).toBe(0);
        });

        describe('rollback', () => {
          it('should roll back to a snapshot', () => {
            const box = new Leaf(
              {},
              {
                children: {
                  topLeft: makePoint(0, 1, 0),
                  topRight: makePoint(1, 1, 0),
                  bottomLeft: makePoint(0, 0, 0),
                  bottomRight: makePoint(1, 0, 0),
                },
              }
            );
            box.branch('topLeft.x').next(3);
            box.branch('topLeft.y').next(6);
            box.emit('rollback', 1);
            expect(box.value).toEqual({
              topLeft: p(3, 1, 0),
              topRight: p(1, 1, 0),
              bottomLeft: p(0, 0, 0),
              bottomRight: p(1, 0, 0),
            });
            expect(box.version).toBe(1);
            expect(box.branch('topLeft.y').value).toBe(1);
            expect(box.branch('topLeft.y').version).toBe(0);
          });
          it('should roll forward after a rollback', () => {
            const box = new Leaf(
              {},
              {
                children: {
                  topLeft: makePoint(0, 1, 0),
                  topRight: makePoint(1, 1, 0),
                  bottomLeft: makePoint(0, 0, 0),
                  bottomRight: makePoint(1, 0, 0),
                },
              }
            );

            box.branch('topLeft.x').next(3);
            box.branch('topLeft.y').next(6);
            box.emit('rollback', 1);
            box.branch('topLeft.z').next(9);

            expect(box.value).toEqual({
              topLeft: p(3, 1, 9),
              topRight: p(1, 1, 0),
              bottomLeft: p(0, 0, 0),
              bottomRight: p(1, 0, 0),
            });
            expect(box.version).toBe(3);
            expect(box.branch('topLeft').version).toBe(3);
            expect(box.branch('topLeft.y').version).toBe(0);
            expect(box.branch('bottomLeft').version).toBe(0);
            expect(box.branch('bottomLeft.y').version).toBe(0);
            expect(box.branch('topLeft.z').version).toBe(3);
          });
        });
      });
    });

    describe('(map)', () => {
      it('should have consistent branch values', () => {
        const point = new Leaf(new Map(), {
          children: {
            x: 0,
            y: 0,
            z: 0,
          },
        });

        expect(point.version).toBe(0);
        expect(point.value).toEqual(
          new Map([
            ['x', 0],
            ['y', 0],
            ['z', 0],
          ])
        );

        point.branch('x').next(3);
        expect(point.value).toEqual(
          new Map([
            ['x', 3],
            ['y', 0],
            ['z', 0],
          ])
        );
        expect(point.version).toBe(1);

        point.branch('y').next(6);
        expect(point.value).toEqual(
          new Map([
            ['x', 3],
            ['y', 6],
            ['z', 0],
          ])
        );
        expect(point.version).toBe(2);
      });

      it('should push changes to children', () => {
        const point = new Leaf(new Map(), {
          children: {
            x: 0,
            y: 0,
            z: 0,
          },
        });

        expect(point.branch('x').version).toBe(0);
        point.next(
          new Map([
            ['x', 1],
            ['y', 4],
            ['z', 9],
          ])
        );

        expect(point.value).toEqual(
          new Map([
            ['x', 1],
            ['y', 4],
            ['z', 9],
          ])
        );
        expect(point.version).toBe(1);

        expect(point.branch('x').value).toBe(1);
        expect(point.branch('x').version).toBe(1);

        expect(point.branch('y').value).toBe(4);
        expect(point.branch('y').version).toBe(1);

        expect(point.branch('z').value).toBe(9);
        expect(point.branch('z').version).toBe(1);
      });
    });
  });

  describe('subscribe', () => {
    describe('scalar', () => {
      it('should echo basic values', () => {
        const history: number[] = [];

        const num = new Leaf(0);

        num.subscribe(value => history.push(value));

        expect(history).toEqual([0]);

        num.next(1);

        expect(history).toEqual([0, 1]);

        num.next(2);

        expect(history).toEqual([0, 1, 2]);
      });
    });

    describe('object', () => {
      it('should express one change per next or action', () => {
        const history: any[] = [];

        const line = new Leaf(
          {},
          {
            setters: 'all',
            children: {
              start: { x: 0, y: 0 },
              end: { x: 1, y: 1 },
            },
            actions: {
              offset(line, x, y) {
                line.branch('start').do.setX(line.value.start.x + x);
                line.branch('start').do.setY(line.value.start.y + y);

                line.branch('end').do.setX(line.value.end.x + x);
                line.branch('end').do.setY(line.value.end.y + y);
              },
            },
          }
        );

        line.subscribe(value => history.push(value));

        expect(history).toEqual([
          {
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
          },
        ]);

        line.next({ start: { x: -1, y: -2 } });

        expect(history).toEqual([
          {
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
          },
          {
            start: { x: -1, y: -2 },
            end: { x: 1, y: 1 },
          },
        ]);

        line.do.offset(3, 3);

        expect(history).toEqual([
          {
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
          },
          {
            start: { x: -1, y: -2 },
            end: { x: 1, y: 1 },
          },
          {
            start: { x: 2, y: 1 },
            end: { x: 4, y: 4 },
          },
        ]);
      });
    });
  });
});
