import { Leaf } from '../src';

describe('login', () => {
  describe('v1', () => {
    it('allows you to set usernames and paswords', () => {
      const login = new Leaf(
        {
          username: '',
          password: '',
          status: 'entering',
        },
        {
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
