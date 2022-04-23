import { LeafV2 } from '../src';

fdescribe('LeafV2', () => {
  it('should reflect initial version', () => {
    const leaf = new LeafV2(1);

    expect(leaf.value).toBe(1);
  });

  describe('.next()', () => {
    it('should update version', () => {
      const leaf = new LeafV2(1);

      leaf.next(2);

      expect(leaf.value).toBe(2);
    });
  });
});
