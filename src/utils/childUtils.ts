import { TYPE_ARRAY, TYPE_MAP, TYPE_OBJECT, TYPE_VALUE } from '../constants';
import { isThere, typeOfValue } from './tests';

export function getKey(value: any, key: any, vType: symbol | null = null): any {
  if (!vType) {
    return getKey(value, key, typeOfValue(value));
  }

  let childValue = null;

  switch (vType) {
    case TYPE_VALUE:
      childValue = null;
      break;

    case TYPE_OBJECT:
      childValue = value[key];
      break;

    case TYPE_MAP:
      childValue = value.get(key);
      break;

    case TYPE_ARRAY:
      childValue = value[key];
      break;

    default:
      childValue = null;
  }

  return childValue;
}

export function setKey(
  value: any,
  key: any,
  childValue: any,
  vType: symbol | null = null
): any {
  if (!vType) {
    return setKey(value, key, childValue, typeOfValue(value));
  }

  switch (vType) {
    case TYPE_OBJECT:
      value[key] = childValue;
      break;

    case TYPE_MAP:
      value.set(key, childValue);
      break;

    case TYPE_ARRAY:
      value[key] = childValue;
      break;

    default:
  }

  return value;
}

export function keys(obj, stringify = false) {
  if (stringify) {
    return keys(obj).map(k => `${k}`);
  }
  if (!isThere(obj)) {
    return [];
  }
  let out = [];
  switch (typeOfValue(obj)) {
    case TYPE_MAP:
      out = Array.from(obj.keys());
      return;

    case TYPE_OBJECT:
      return Array.from(Object.keys(obj));
      return;
  }
  return out;
}
