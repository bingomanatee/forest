/* eslint-disable @typescript-eslint/camelcase,@typescript-eslint/no-this-alias */
import Leaf from './Leaf';
import { makeValue, isCompound, delKeys, detectForm, isThere } from './utils';
import {
  CHANGE_ABSOLUTE,
  CHANGE_DOWN,
  FORM_ARRAY,
  FORM_MAP,
  FORM_OBJECT,
} from './constants';
import { Change } from './Change';
import produce, { isDraftable } from 'immer';

export default class LeafImmer extends Leaf {
  get value() {
    return this._value;
  }
  set value(value) {
    let nextValue = value;

    switch (detectForm(value)) {
      case FORM_MAP:
      case FORM_OBJECT:
      case FORM_ARRAY:
        if (isDraftable(value)) {
          try {
            nextValue = produce(value, draft => draft);
            this.emit('debug', ['nextValue set to ', nextValue, 'from ', nextValue]);
          } catch (err) {
            nextValue = value;
          }
        }
        break;
    }

    this.emit('debug', ['leafImmer set: nextValue = ', nextValue, 'value = ', value]);
    const form = detectForm(nextValue);
    if (!isThere(this.form)) {
      // initialize form to first time value is set.
      this.form = form;
    }
    this._value = nextValue;
    if (this._initialized) this._dirty = true;
  }

  _makeChange(value, direction) {
    let updatedValue = value;

    if (direction !== CHANGE_ABSOLUTE && isCompound(this.form)) {
      try {
        updatedValue = produce(this.value, draft => {
          return makeValue(draft, value);
        });
      } catch (err) {
        this.emit('debug', ['error in producing with makeValue:', err]);
        try {
          updatedValue = makeValue(this.value, value);
        } catch (err2) {
          updatedValue = value;
        }
      }
    }
    this.emit( 'debug', 
     [ 'LeafImmer --- >>> setting value from ', this.value, ' to ', updatedValue, 'from ', value]
    );
    return new Change(value, this, updatedValue);
  }

  _branch(value, name) {
    return new LeafImmer(value, { parent: this, name });
  }

  _changeFromBranch(branch) {
    if (branch.name && this.branch(branch.name) === branch) {
      switch (this.form) {
        case FORM_OBJECT:
          this.next({ [branch.name]: branch.value }, CHANGE_DOWN);
          break;

        case FORM_MAP:
          this.next(new Map([[branch.name, branch.value]]), CHANGE_DOWN);
          break;

        case FORM_ARRAY:
          const next = [...this.value];
          next[branch.name] = branch.value;
          this.next(next, CHANGE_DOWN);
          break;

        default:
      }
    }
  }

  _delKeys(keys) {
    try {
      return produce(this.value, draft => {
        return delKeys(draft, keys);
      });
    } catch (err) {
      return super._delKeys(keys);
    }
  }
}
