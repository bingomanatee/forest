import { utils } from '../src';

describe.only('utils', () => {
  it('should create a lazyProp (object) without creator', () => {
    class Klass {
      public _foo;
      @utils.lazyProp('_foo')
      public foo;
    }

    const c = new Klass();

    expect(c._foo).toBeFalsy();
    c.foo.bar = 3;
    expect(c._foo).toEqual({ bar: 3 });
  });
});
