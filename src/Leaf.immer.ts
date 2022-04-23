/* eslint-disable @typescript-eslint/camelcase,@typescript-eslint/no-this-alias */
import Leaf from './Leaf';
import { makeValue, isCompound, delKeys, detectForm } from './utils';
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
  get baseValue() {
    return this._value;
  }
  set baseValue(value) {
    let nextValue = value;

    switch (detectForm(value)) {
      case FORM_MAP:
      case FORM_OBJECT:
      case FORM_ARRAY:
        if (isDraftable(value)) {
          try {
            nextValue = produce(value, draft => draft);
            this.emit('debug', [
              'nextValue set to ',
              nextValue,
              'from ',
              nextValue,
            ]);
          } catch (err) {
            nextValue = value;
          }
        }
        break;
    }

    this.emit('debug', [
      'leafImmer set: nextValue = ',
      nextValue,
      'value = ',
      value,
    ]);
    this._value = nextValue;
    if (this._isInitialized) this._dirty = true;
  }

  _makeChange(value, direction) {
    let updatedValue = value;

    if (direction !== CHANGE_ABSOLUTE && isCompound(this.form)) {
      try {
        updatedValue = produce(this.baseValue, draft => {
          return makeValue(draft, value);
        });
      } catch (err) {
        this.emit('debug', ['error in producing with makeValue:', err]);
        try {
          updatedValue = makeValue(this.baseValue, value);
        } catch (err2) {
          updatedValue = value;
        }
      }
    }
    this.emit('debug', [
      'LeafImmer --- >>> setting value from ',
      this.baseValue,
      ' to ',
      updatedValue,
      'from ',
      value,
    ]);
    return new Change(value, this, updatedValue);
  }

  _branch(value, name) {
    return new LeafImmer(value, { parent: this, name });
  }

  _changeFromChild(child) {
    if (child.name && this.child(child.name) === child) {
      switch (this.form) {
        case FORM_OBJECT:
          this.next({ [child.name]: child.baseValue }, CHANGE_DOWN);
          break;

        case FORM_MAP:
          this.next(new Map([[child.name, child.baseValue]]), CHANGE_DOWN);
          break;

        case FORM_ARRAY:
          const next = [...this.baseValue];
          next[child.name] = child.baseValue;
          this.next(next, CHANGE_DOWN);
          break;

        default:
      }
    }
  }

  _delKeys(keys) {
    try {
      return produce(this.baseValue, draft => {
        return delKeys(draft, keys);
      });
    } catch (err) {
      return super._delKeys(keys);
    }
  }
}
