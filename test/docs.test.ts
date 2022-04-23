import { Leaf } from '../src';

describe('docs', () => {
  describe('login', () => {
    describe('v1', () => {
      it('allows you to set usernames and passwords', () => {
        const login = new Leaf(
          {
            username: '',
            password: '',
            status: 'entering',
          },
          {
            debug: false,
            selectors: {
              isReady({ username, password }) {
                return !!(password && username);
              },
            },
            actions: {
              reset(leaf) {
                leaf.next({
                  password: '',
                  status: 'entering',
                });
              },
            },
          }
        );

        let latest = null;

        login.subscribe(value => {
          latest = value;
        });

        expect(latest).toEqual({
          username: '',
          password: '',
          $isReady: false,
          status: 'entering',
        });

        login.do.setUsername('bob');

        expect(latest).toEqual({
          username: 'bob',
          password: '',
          $isReady: false,
          status: 'entering',
        });
      });
    });
  });

  describe('value page', () => {
    it('should echo values', () => {
      const numberLeaf = new Leaf(6);
      const stringLeaf = new Leaf('Bob');
      const objectLeaf = new Leaf({ x: 0, y: 0 });
      const mapLeaf = new Leaf(
        new Map([
          ['x', 0],
          ['y', 0],
        ])
      );

      numberLeaf.next(10);
      //  console.log('new number leaf value:', numberLeaf.value);

      stringLeaf.next('Rick');
      // console.log('new string leaf value: ', stringLeaf.value);

      objectLeaf.next({ y: 3, z: 6 });
      // console.log('new object leaf value', objectLeaf.value);

      mapLeaf.next(
        new Map([
          ['y', 3],
          ['z', 6],
        ])
      );
      //  console.log('new map leaf value', mapLeaf.value);

      mapLeaf.delKeys('y');
      // console.log('new map leaf value without y', mapLeaf.value);
    });

    it('should enforce form', () => {
      const point = new Leaf({ x: 1, y: 2 });
      //  point.subscribe(value => console.log('value of point', value));
      point.next({ x: 3, y: 4 });
      try {
        point.next('Bob');
      } catch (err) {
        // console.log('bad form error: ', err);
      }
      point.next({ x: 5, y: 6 });

      /**
       value of point { x: 1, y: 2 }
       value of point { x: 3, y: 4 }
       bad form error:  Error: incorrect form for leaf [ROOT]; wanted Symbol(form:object), got Symbol(form:value)...
       value of point { x: 5, y: 6 }
       */
    });

    it('will not enforce form if any', () => {
      const point = new Leaf({ x: 1, y: 2 }, { any: true });
      //  point.subscribe(value => console.log('value of  unguarded point', value));
      point.next({ x: 3, y: 4 });
      try {
        point.next('Bob');
      } catch (err) {
        //  console.log('unguarded bad form error: ', err);
      }
      point.next({ x: 5, y: 6 });

      /**
       value of  unguarded point { x: 1, y: 2 }
       value of  unguarded point { x: 3, y: 4 }
       value of  unguarded point Bob
       value of  unguarded point { x: 5, y: 6 }
       */
    });
  });

  describe('subscription', () => {
    it('subscribers', () => {
      const numLeaf = new Leaf(6);
      numLeaf.next(7);
      // const sub = numLeaf.subscribe(value => console.log(value));
      numLeaf.next(8);
      numLeaf.next(9);
      numLeaf.next(10);
      // sub.unsubscribe();
      numLeaf.next(11);
      numLeaf.next(12);
    });
  });

  describe('transactions', () => {
    it('should lock values in transit', () => {
      const leaf = new Leaf(
        {
          x: 0,
          y: 0,
          z: 0,
        },
        {
          actions: {
            updateAll(leaf, x, y, z) {
              leaf.do.setX(x);
              leaf.do.setY(y);
              // console.log('leafs y is now ', leaf.value.y);
              leaf.do.setZ(z);
              if (typeof y !== 'number') throw new Error('why?');
            },
          },
        }
      );

      // leaf.subscribe(value => console.log(value));

      leaf.do.setX(1);
      leaf.do.setY(2);
      leaf.do.setZ(3);

      leaf.do.updateAll(4, 5, 6);

      try {
        leaf.do.updateAll(7, '8', 9);
      } catch (err) {
        // console.log('error:', err);
      }
      //  console.log('current value of leaf: ', leaf.value);
    });
  });

  describe('actions', () => {
    it('should call nested actions', () => {
      const leaf = new Leaf(
        {
          x: 0,
          y: 0,
          z: 0,
        },
        {
          actions: {
            updateAll(leaf, x, y, z) {
              leaf.do.setX(x);
              leaf.do.setY(y);
              leaf.do.setZ(z);
            },
            magnitude(leaf) {
              return Math.sqrt(
                leaf.value.x ** 2 + leaf.value.y ** 2 + leaf.value.z ** 2
              );
            },
            normalize(leaf) {
              const mag = leaf.do.magnitude();
              leaf.do.updateAll(
                leaf.value.x / mag,
                leaf.value.y / mag,
                leaf.value.z / mag
              );
            },
          },
        }
      );

      // leaf.subscribe(value => console.log('point value is ', value));

      leaf.do.setX(1);
      leaf.do.setY(2);
      leaf.do.setZ(3);
      leaf.do.updateAll(4, 5, 6);
      leaf.do.normalize();

      /**
       point value is  { x: 0, y: 0, z: 0 }
       point value is  { x: 1, y: 0, z: 0 }
       point value is  { x: 1, y: 2, z: 0 }
       point value is  { x: 1, y: 2, z: 3 }
       point value is  { x: 4, y: 5, z: 6 }
       point value is  { x: 0.4558423058385518, y: 0.5698028822981898, z: 0.6837634587578276 }
       */
    });

    it('fibonacci', () => {
      const fibo = new Leaf([1, 2], {
        actions: {
          nextValue(leaf, numberOfValues = 1) {
            for (let i = 0; i <= numberOfValues; ++i) {
              const last = leaf.value[leaf.value.length - 1];
              const prev = leaf.value[leaf.value.length - 2];
              leaf.next([...leaf.value, last + prev]);
            }
          },
        },
      });

      //   fibo.subscribe(value => console.log('fibonacci series is now ', value));
      fibo.do.nextValue();
      fibo.do.nextValue(5);
      fibo.do.nextValue(2);
      /**
       *
         fibonacci series is now  [ 1, 2 ]
         fibonacci series is now  [ 1, 2, 3, 5 ]
         fibonacci series is now  [
         1,  2,  3,  5,  8,
         13, 21, 34, 55, 89
         ]
         fibonacci series is now  [
         1,  2,  3,  5,   8,  13,
         21, 34, 55, 89, 144, 233,
         377
        ]
       */
    });
  });

  describe('type', () => {
    it('should break on type exception', () => {
      const num = new Leaf(100, { type: true });
      const numUntyped = new Leaf(100);
      const numAny = new Leaf(100, { any: true });

      // num.subscribe(value => console.log('num value: ', value));
      // numUntyped.subscribe(value => console.log('numUntyped value: ', value));
      // numAny.subscribe(value => console.log('numAny value: ', value));

      num.next(200);
      numUntyped.next(200);
      numAny.next(200);
      try {
        num.next('three hundred');
      } catch (err) {
        //  console.log('type error:', err);
      }
      numUntyped.next('three hundred');
      numAny.next('three hundred');
      num.next(400);
      numUntyped.next(400);
      numAny.next(200);

      try {
        num.next([500]);
      } catch (err) {
        // console.log('num form error: ', err);
      }

      try {
        numUntyped.next([500]);
      } catch (err) {
        // console.log('numUntyped form error: ', err);
      }
      numAny.next([500]);

      num.next(600);
      numUntyped.next(600);
      numAny.next(600);

      /**
       *
       num value:  100
       numUntyped value:  100
       numAny value:  100
       num value:  200
       numUntyped value:  200
       numAny value:  200
       type error: Error: incorrect type for leaf [ROOT]
       numUntyped value:  three hundred
       numAny value:  three hundred
       num value:  400
       numUntyped value:  400
       num form error:  Error: incorrect type for leaf [ROOT]
       numUntyped form error:  Error: incorrect form for leaf [ROOT]; wanted Symbol(form:value), got Symbol(form:array)
       numAny value:  [ 500 ]
       num value:  600
       numUntyped value:  600
       numAny value:  600
       */
    });
  });
});
