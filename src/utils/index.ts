import { produce } from 'immer';

import lazy from './lazy';
import flattenDeep from 'lodash.flattendeep';

export * from './childUtils';
export * from './tests';
export * from './conversion';
function asImmer(value) {
  try {
    return produce(value, draft => draft);
  } catch (err) {
    return value;
  }
}

export { lazy, flattenDeep, produce, asImmer };
