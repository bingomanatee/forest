import { Leaf } from '../src';

// import { inspect } from 'util';

describe('Leaf', () => {
  describe('events', () => {
    it('should listen to a named event', () => {
      const leaf = new Leaf(0);
      let count = 0;

      leaf.on('count', () => {
        ++count;
      });

      expect(count).toBe(0);

      leaf.emit('count');
      expect(count).toBe(1);
      leaf.emit('count');
      expect(count).toBe(2);
      leaf.emit('count');
      expect(count).toBe(3);
    });

    it('should accept values as input', () => {
      const leaf = new Leaf(0);
      let count = 0;

      leaf.on('count', n => {
        count += n;
      });

      expect(count).toBe(0);

      leaf.emit('count', 1);
      expect(count).toBe(1);

      leaf.emit('count', 2);
      expect(count).toBe(3);

      leaf.emit('count', 4);
      expect(count).toBe(7);
    });

    it('should stop listening after complete', () => {
      const leaf = new Leaf(0);
      let count = 0;

      leaf.on('count', n => {
        count += n;
      });

      expect(count).toBe(0);

      leaf.emit('count', 1);
      expect(count).toBe(1);

      leaf.emit('count', 2);
      expect(count).toBe(3);

      leaf.complete();

      leaf.emit('count', 2);
      expect(count).toBe(3);
    });

    it('should pass thrown errors out of the listener', () => {
      const leaf = new Leaf(0);
      let count = 0;

      leaf.on('count', n => {
        if (n <= 0) {
          throw new Error('count input must be > 0');
        }
        count += n;
      });
      leaf.on('error', (value, name) => {
        console.log('emit found', value, name);
      });

      expect(count).toBe(0);

      leaf.emit('count', 1);
      expect(count).toBe(1);

      expect(() => {
        leaf.emit('count', -2);
      }).toThrow();

      expect(count).toBe(1);

      leaf.emit('count', 2);
      expect(count).toBe(3);
    });
  });
});
