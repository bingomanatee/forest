import { produce } from 'immer';
const isEqual = require('lodash/isEqual');
import lazy from './lazy';

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

export { lazy, produce, isEqual, asImmer };
