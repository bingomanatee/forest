import { produce } from 'immer';

export * from './lazy';
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

export { produce, asImmer };
