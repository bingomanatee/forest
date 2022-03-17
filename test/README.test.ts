import { Leaf } from '../src';

// import { inspect } from 'util';

describe('Leaf', () => {
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
      console.log('user is ', user.value);
      //   user is  { firstName: 'Bob', lastName: '', age: 45, gender: '?' }
    });
  });
});
