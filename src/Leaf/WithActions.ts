import { FORM_ARRAY, FORM_MAP, FORM_OBJECT } from '../constants';
import { e, isCompound, isFn, isObj, keys, ucFirst } from '../utils';

function listenForSetters(target, opts) {
  target.on('action', ({ name, fn, inferred = false, noBlend = false }) => {
    try {
      if (inferred) {
        if (!target._inferredActions) {
          // @ts-ignore
          target._inferredActions = {};
        }
        target._inferredActions[name] = (...args) =>
          target.transact(() => fn(target, ...args));
      } else {
        if (!target._userActions) {
          target._userActions = {};
        }
        target._userActions[name] = (...args) =>
          target.transact(() => fn(target, ...args));
      }
      if (!noBlend) {
        target.emit('actions');
      }
      return true;
    } catch (err) {
      console.warn('cannot addAction', name, fn);
      // @ts-ignore
      console.warn(err.message);
      return false;
    }
  });

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
      if (target.isUsingSetters) {
        const valKeys = keys(target.value);
        target._inferredActions = {};
        valKeys.forEach(key => {
          target.emit('action', {
            name: `set${ucFirst(key)}`,
            fn: (leaf, value) => {
              return leaf.set(key, value);
            },
            inferred: true,
            noBlend: true,
          });
        });

        target.beach((_branch, key) => {
          if (!valKeys.includes(key)) {
            target.emit('action', {
              name: `set${ucFirst(key)}`,
              fn: (leaf, value) => {
                return leaf.set(key, value);
              },
              inferred: true,
              noBlend: true,
            });
          }
        });
      }
    }

    // --- part two: merging actions into _do;
    target._do = {};
    [target._inferredActions, target._userActions].forEach(pojoOfFunctions => {
      if (isObj(pojoOfFunctions)) {
        Object.assign(target._do, pojoOfFunctions);
      }
    });
  });

  const { actions = false } = opts;
  if (isObj(actions)) {
    Object.keys(actions).forEach(key => {
      const fn = actions[key];
      if (isFn(fn)) {
        target.emit('action', {
          name: key,
          fn,
        });
      } else {
        console.warn('bad action value for ', key, ', value must be fn', fn);
      }
    });
  }
}

export default function WithActions(Cons) {
  return class LeafWithActions extends Cons {
    _useSetters: boolean | string | null = null;
    _inferredActions: any = null;
    _userActions: any = null;

    constructor(value, opts: any = {}) {
      super(value, opts);

      listenForSetters(this, opts);

      this.emit('actions', 'setters');
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
        } else if (!this.isRoot) {
          // if the root._useSetters is 'all', then all the setters in
          if (this.root._useSetters === 'all') {
            this._useSetters = true;
          } else {
            // setters are skipped for non-root leafs by default
            this._useSetters = false;
          }
        }
      }
    }

    set(name, value: any) {
      if (this._isStopped) {
        throw e('cannot set after a branch is stopped', { name, value });
      }
      if (this._branches && this._branches.has(name)) {
        this.branch(name).next(value);
      } else {
        switch (this.form) {
          case FORM_OBJECT:
            this.next({ [name]: value });
            break;

          case FORM_MAP:
            this.next(new Map([[name, value]]));
            break;

          case FORM_ARRAY:
            const next = [...this.value];
            if (typeof name === 'number') {
              if (Array.isArray(value)) {
                next.splice(name, value.length, ...value);
              } else {
                next[name] = value;
              }
              this.next(next);
            } else {
              console.warn('set (array) with non-numeric index');
            }
            break;

          default:
            console.warn('set attempted on subject of type', this.form);
        }
      }
      return value;
    }
  };
}
