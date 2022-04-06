import { Leaf } from '../src';
import { TYPE_DATE, TYPE_NUMBER } from '../src/constants';

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

  describe('type', () => {
    function makeLeaf() {
      return new Leaf(
        {},
        {
          branches: {
            str: new Leaf('alpha', { type: true }),
            num: new Leaf(100, { type: true }),
            dn: new Leaf(100, { type: [TYPE_DATE, TYPE_NUMBER] }),
          },
        }
      );
    }

    it('should test numbers', () => {
      const typeLeaf = makeLeaf();

      typeLeaf.do.setNum(3);
      expect(typeLeaf.value.num).toBe(3);

      expect(() => typeLeaf.do.setNum('2')).toThrow(
        /incorrect type for leaf num/
      );
      expect(typeLeaf.value.num).toBe(3);

      typeLeaf.do.setNum(4);
      expect(typeLeaf.value.num).toBe(4);
    });

    it('should test multi-types', () => {
      const typeLeaf = makeLeaf();

      const d = new Date();
      typeLeaf.do.setDn(d);
      expect(typeLeaf.value.dn).toBe(d);

      expect(() => typeLeaf.do.setDn('2')).toThrow(
        /incorrect type for leaf dn/
      );
      expect(typeLeaf.value.dn).toBe(d);

      typeLeaf.do.setDn(4);
      expect(typeLeaf.value.dn).toBe(4);
    });

    it('should test for strings', () => {
      const typeLeaf = makeLeaf();
      typeLeaf.do.setStr('beta');
      expect(typeLeaf.value.str).toBe('beta');

      expect(() => {
        typeLeaf.do.setStr([]);
      }).toThrow(/incorrect type for leaf str/);

      expect(typeLeaf.value.str).toBe('beta');

      typeLeaf.do.setStr('gamma');
      expect(typeLeaf.value.str).toBe('gamma');
    });
  });
});
