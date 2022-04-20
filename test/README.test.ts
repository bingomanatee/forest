import { Leaf } from '../src';

// import { inspect } from 'util';

describe('README', () => {
  it('should allow for value tests', () => {
    const numLeaf = new Leaf(0, {
      test({ next }): string | void {
        if (next < 0) throw new Error('cannot be negative');
        if (next % 2) return 'must be even';
      },
      debug: false,
    });

    // numLeaf.subscribe(value => console.log('leaf value: ', value));

    numLeaf.next(4);

    try {
      numLeaf.next(5);
    } catch (err) {
      // console.log('error:', err);
    }
    // console.log('leaf is still', numLeaf.value);

    numLeaf.next(8);
    try {
      numLeaf.next(-4);
    } catch (err2) {
      //  console.log('error 2:', err2);
    }
    // console.log('leaf is still', numLeaf.value);
    numLeaf.next(10);
  });
  describe('docs', () => {
    it('box example', () => {
      function point(x, y) {
        return new Leaf(
          { x, y },
          {
            children: {
              x: new Leaf(x, { type: true }),
              y: new Leaf(y, { type: true }),
            },
          }
        );
      }

      const box = new Leaf(
        {
          color: 'red',
        },
        {
          children: {
            topLeft: point(0, 0),
            bottomRight: point(1, 1),
          },
          actions: {
            width(leaf) {
              return Math.abs(leaf.value.bottomRight.x - leaf.value.topLeft.x);
            },
            height(leaf) {
              return Math.abs(leaf.value.topLeft.y - leaf.value.bottomRight.y);
            },
            area(leaf) {
              return leaf.do.width() * leaf.do.height();
            },
          },
        }
      );

      /*  box.subscribe(_value => {
        //   console.log('... is now', value);
      });*/

      box.do.setBottomRight({ x: 50, y: 50 });
      //  console.log('box area:', box.do.area());
    });

    describe('login form 2', () => {
      function makeField(title, type, validator) {
        return new Leaf(
          {
            title,
            value: '',
            type,
            touched: false,
          },
          {
            actions: {
              update(leaf, value) {
                leaf.do.setValue(value);
                leaf.do.setTouched(true);
              },
              isValid(leaf) {
                return !leaf.do.errors();
              },
              isEmpty(leaf) {
                return !leaf.value.value;
              },
              errors(leaf) {
                if (leaf.do.isEmpty()) {
                  return 'must have a value';
                }
                return validator(leaf.value.value);
              },
            },
          }
        );
      }

      function makeLogin() {
        return new Leaf(
          {
            status: 'entering',
            response: null,
          },
          {
            children: {
              // @ts-ignore
              username: makeField('User Name', 'text', value => {
                if (/[\s]+/.test(value)) {
                  return 'username cannot have spaces';
                }
              }),
              // @ts-ignore
              password: makeField('Password', 'password', value => {
                if (/[\s]+/.test(value)) {
                  return 'password cannot have spaces';
                }
              }),
            },
            actions: {
              isReady(leaf) {
                return !!(leaf.value.password && leaf.value.username);
              },
              reset(leaf) {
                leaf.next({
                  status: 'entering',
                  response: null,
                  password: { value: '', touched: false },
                  username: { value: '', touched: false },
                });
              },
            },
          }
        );
      }

      it('should change on branch action', () => {
        const login = makeLogin();

        let current;
        login.subscribe(value => (current = value));

        expect(current.username.touched).toBeFalsy();
        expect(current.username.error).toBeFalsy();

        login.branch('username').do.update('foo');

        // console.log('next state: ', login.toJSON(true));
        expect(current.username.value).toBe('foo');
        expect(current.username.touched).toBeTruthy();
        expect(current.username.error).toBeFalsy();
      });

      it('should reset the children partially', () => {
        const login = makeLogin();

        let current;
        login.subscribe(value => (current = value));

        login.branch('username').do.update('foo');
        login.branch('password').do.update('bad pass');
        //  console.log('status 1: ', current);
        login.do.reset();
        //  console.log('after reset: ', current);

        expect(current.username.value).toBe('');
        expect(current.username.title).toBe('User Name');
      });
    });
  });

  describe('actions', () => {
    it('should allow for custom setters', () => {
      const user = new Leaf(
        {
          firstName: '',
          lastName: '',
          age: 0,
          gender: '?',
        },
        {
          actions: {
            setFirstName(leaf, n) {
              if (typeof n !== 'string')
                throw new Error('first name must be a string');
              leaf.set('firstName', n.trim());
            },
            setAge(leaf, age) {
              if (typeof age === 'string') age = Number.parseInt(age, 10);
              if (Number.isNaN(age)) {
                throw new Error('age is only a number');
              }
              leaf.set('age', age);
            },
          },
        }
      );

      user.do.setFirstName(' Bob  ');
      user.do.setAge('45');
      // console.log('user is ', user.value);
      //   user is  { firstName: 'Bob', lastName: '', age: 45, gender: '?' }
    });
  });
});
