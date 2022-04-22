import { isCompound, isFn, isObj, keys, ucFirst } from '../utils';

function listenForSetters(target) {
  target.on('action-remove-setter', ({ name, noBlend = true }) => {
    const actionName = `set${ucFirst(name)}`;
    if (target._inferredActions && actionName in target._inferredActions) {
      delete target._inferredActions[actionName];
    }
    if (!noBlend) {
      target.emit('actions');
    }
  });
  /**
   * this listener blends inferred and user actions into do.
   * if type is "setters" also infers the setters
   */
  target.on('actions', type => {
    // --- part one: inferring all the Leaf's values into setters
    if (type === 'setters') {
      target._updateSetters(true);
    }

    target._makeDo();
  });
}

export default function WithActions(Cons) {
  return class LeafWithActions extends Cons {
    _useSetters: boolean | string | null = null;
    _inferredActions: any = null;
    _userActions?: any;

    constructor(value, opts: any = {}) {
      super(value, opts);

      listenForSetters(this);

      this._updateSetters();
    }

    __do?: any;

    get _do() {
      return this.__do;
    }
    set _do(value) {
      this.emit('debug', { n: 2, message: ['setting _do to ', value] });
      this.__do = value;
    }
    get do(): { [key: string]: Function } {
      if (!this._do) {
        this._do = {};
      }
      return this._do;
    }

    get isUsingSetters() {
      if (!isCompound(this.form)) {
        return false;
      }

      if (!this.parent) {
        return this._useSetters !== false;
        // unless actively switched off, all root Leafs use setters
      } else {
        if (this.root._useSetters === 'all') {
          return true;
        } else {
          return this._useSetters === true;
          // unless (the above or ) actively switched on, all branch Leafs isUsingSetters = false;
        }
      }
    }

    config(opts) {
      super.config(opts);

      if (opts && typeof opts === 'object') {
        if ('setters' in opts) {
          // respect any explicit imperitave for setters
          this._useSetters = opts.setters;
        }

        if (isObj(opts.actions)) {
          Object.keys(opts.actions).forEach(key => {
            const fn = opts.actions[key];
            if (isFn(fn)) {
              this.addAction(key, fn, false, true);
            } else {
              console.warn(
                'bad action value for ',
                key,
                ', value must be fn',
                fn
              );
            }
          });
        }

        this._makeDo();
      }
    }

    addAction(name, fn, inferred = false, noBlend = false) {
      this.emit('debug', {
        n: 2,
        message: [
          'addAction name = ',
          name,
          'inferred = ',
          inferred,
          'noBlend = ',
          noBlend,
        ],
      });
      try {
        if (inferred) {
          if (!this._inferredActions) {
            // @ts-ignore
            this._inferredActions = {};
          }
          this._inferredActions[name] = (...args) =>
            this.transact(() => fn(this, ...args));
        } else {
          if (!this._userActions) {
            this.emit('debug', {
              n: 2,
              message: 'addAction: creating userAction',
            });
            this._userActions = {};
          }
          this._userActions[name] = (...args) =>
            this.transact(() => fn(this, ...args));
          this.emit('debug', {
            n: 1,
            message: [
              'addAction name = ',
              name,
              '_userActions is now  ',
              this._userActions,
            ],
          });
        }
      } catch (err) {
        this.emit('debug', ['addAction: throws', err]);
        console.warn('cannot add action', name, fn, err);
      }
      if (!noBlend) {
        this.emit('actions');
      }
      return this;
    }

    addSetter(name, noBlend = false) {
      this.addAction(
        `set${ucFirst(name)}`,
        (leaf, value) => {
          return leaf.set(name, value);
        },
        true,
        noBlend
      );
    }

    _makeDo() {
      this.emit('debug', {
        n: 2,
        message: ['_makeDo use = ', this.isUsingSetters],
      });

      // --- part two: merging actions into _do;
      this._do = {};
      [this._inferredActions, this._userActions].forEach(pojoOfFunctions => {
        if (isObj(pojoOfFunctions)) {
          Object.assign(this._do, pojoOfFunctions);
        }
      });
    }

    _updateSetters(noBlend = false) {
      this.emit('debug', {
        message: [
          '_updateSetters: noBlend=',
          noBlend,
          'use = ',
          this.isUsingSetters,
        ],
      });

      this._inferredActions = {};

      if (!this.isUsingSetters) {
        this.emit('debug', '_updateSetters: not using setters, not executing');
        return;
      }

      this.beach((_branch, key) => {
        this.addSetter(key, true);
      });

      keys(this.baseValue).forEach(key => {
        this.addSetter(key, true);
      });

      if (!noBlend) {
        this._makeDo();
      }
    }
  };
}
