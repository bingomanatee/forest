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
});
