/* eslint-disable @typescript-eslint/camelcase,@typescript-eslint/no-this-alias */
import Leaf from './Leaf';
import { delKeys, setKey } from './utils';
import { ABSENT, CHANGE_DOWN } from './constants';

import produce, { enableMapSet } from 'immer';

enableMapSet();

export default class LeafImmer extends Leaf {
  amend(key, value) {
    const next = produce(this.baseValue, draft => {
      setKey(draft, key, value, this.form);
    });
    this.next(next, CHANGE_DOWN);
  }

  valueWithSelectors(value = ABSENT) {
    if (value === ABSENT) {
      value = this.baseValue;
    }
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
