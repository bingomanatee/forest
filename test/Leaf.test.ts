import { Leaf } from '../src';

// import { inspect } from 'util';

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
      l.next(6);
      expect(l.value).toBe(6);
      expect(l.version).toBe(1);
    });
  });

  describe('branches', () => {
    describe('(object)', () => {
      it('should have consistent branch values', () => {
        const point = new Leaf(
          {},
          {
            branches: {
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

      it.only('should push changes to branches', () => {
        const point = new Leaf(
          {},
          {
            branches: {
              x: 0,
              y: 0,
              z: 0,
            },
          }
        );

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

      describe('rollback', () => {
        it('should roll back to a snapshot', () => {
          const point = new Leaf(
            {},
            {
              branches: {
                x: 0,
                y: 0,
                z: 0,
              },
            }
          );

          point.branch('x').next(3);
          point.branch('y').next(6);
          point.rollbackTo(1);

          expect(point.value).toEqual({ x: 3, y: 0, z: 0 });
          expect(point.version).toBe(1);

          expect(point.branch('y').value).toBe(0);
          expect(point.branch('y').version).toBe(0);
        });
        it('should roll forward after a rollback', () => {
          const point = new Leaf(
            {},
            {
              branches: {
                x: 0,
                y: 0,
                z: 0,
              },
            }
          );

          point.branch('x').next(3);
          point.branch('y').next(6);
          point.rollbackTo(1);
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
              branches: p(x, y, z),
            }
          );
        }

        it('should have consistent branch values', () => {
          const box = new Leaf(
            {},
            {
              branches: {
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
                branches: {
                  topLeft: makePoint(0, 1, 0),
                  topRight: makePoint(1, 1, 0),
                  bottomLeft: makePoint(0, 0, 0),
                  bottomRight: makePoint(1, 0, 0),
                },
              }
            );
            box.branch('topLeft.x').next(3);
            box.branch('topLeft.y').next(6);
            box.rollbackTo(1);
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
                branches: {
                  topLeft: makePoint(0, 1, 0),
                  topRight: makePoint(1, 1, 0),
                  bottomLeft: makePoint(0, 0, 0),
                  bottomRight: makePoint(1, 0, 0),
                },
              }
            );

            box.branch('topLeft.x').next(3);
            box.branch('topLeft.y').next(6);
            box.rollbackTo(1);
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
  });
});
