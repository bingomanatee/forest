import {
  ABSENT,
  FORM_ARRAY,
  FORM_MAP,
  FORM_OBJECT,
  FORM_VALUE, TypeType,
} from '../constants';
import { isThere, detectForm } from './tests';

export function getKey(value: any, key: any, vType: any = null): any {
  if (!vType) {
    return getKey(value, key, detectForm(value));
  }

  let childValue = null;

  switch (vType) {
    case FORM_VALUE:
      childValue = null;
      break;

    case FORM_OBJECT:
      childValue = value[key];
      break;

    case FORM_MAP:
      childValue = value.get(key);
      break;

    case FORM_ARRAY:
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
  vType: any = null
): any {
  if (!vType) {
    return setKey(value, key, childValue, detectForm(value));
  }

  switch (vType) {
    case FORM_OBJECT:
      value[key] = childValue;
      break;

    case FORM_MAP:
      value.set(key, childValue);
      break;

    case FORM_ARRAY:
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
  let out: any = [];
  switch (detectForm(obj)) {
    case FORM_MAP:
      out = Array.from(obj.keys());
      break;

    case FORM_OBJECT:
      out = Array.from(Object.keys(obj));
      break;
  }
  return out;
}

export function delKeys(obj, keys, type: TypeType = ABSENT, collapse = false) {
  if (!obj) return obj;
  if (!isThere(type)) return delKeys(obj, keys, detectForm(obj), collapse);
  switch (type) {
    case FORM_OBJECT:
      keys.forEach(key => {
        delete obj[key];
      });
      break;

    case FORM_MAP:
      keys.forEach(key => {
        obj.delete(key);
      });
      break;

    case FORM_ARRAY:
      if (collapse) {
        obj = obj.filter((_, key) => {
          return !keys.includes(key);
        });
      } else
        obj = obj.map((value, key) => {
          return keys.includes(key) ? undefined : value;
        });

      break;
  }

  return obj;
}
