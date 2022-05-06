/* eslint-disable @typescript-eslint/camelcase,@typescript-eslint/no-this-alias */
import Leaf from './Leaf';
import { delKeys, detectForm } from './utils';
import { ABSENT, FORM_ARRAY, FORM_MAP, FORM_OBJECT } from './constants';

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

  valueWithSelectors(value = ABSENT) {
    try {
      return produce(value, draft => {
        super.valueWithSelectors(draft);
      });
    } catch (err) {
      return super.valueWithSelectors(value);
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
