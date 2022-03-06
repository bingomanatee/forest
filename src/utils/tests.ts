import {
  ABSENT,
  NAME_UNNAMED,
  TYPE_ARRAY,
  TYPE_MAP,
  TYPE_LEAF,
  TYPE_OBJECT,
  TYPE_VALUE,
} from '../constants';
import { isMirror } from './reflection';

const isNum = require('lodash/isNumber');

export const isNumber = isNum;

export function isThere(item) {
  return ![ABSENT, NAME_UNNAMED, undefined].includes(item);
}

export function ucFirst(str) {
  if (!isStr(str, true)) {
    return '';
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * returns true if the object is a POJO object -- that is,
 * its non-null, is an instance of Object, and is not an array.
 *
 * @param o
 * @returns {boolean}
 */
export function isObj(o) {
  return o && typeof o === 'object' && !Array.isArray(o) && !(o instanceof Map);
}

/**
 * a type check; if nonEmpty = true, only true if array has indexed values.
 * @param a
 * @param nonEmpty
 * @returns {boolean}
 */
export function isArr(a, nonEmpty = false) {
  return Array.isArray(a) && (!nonEmpty || a.length);
}

export const isMap = m => m && m instanceof Map;

export const isFn = f => typeof f === 'function';

export const e = (err, notes = {}) => {
  if (typeof err === 'string') {
    err = new Error(err);
  }
  if (!isThere(notes)) {
    notes = {};
  } else if (!isObj(notes)) {
    notes = { notes };
  }
  return Object.assign(err, notes);
};

export function isStr(s, nonEmpty = false) {
  if (typeof s === 'string') {
    return nonEmpty ? !!s : true;
  }
  return false;
}

export function typeOfValue(value) {
  if (isMirror(value)) {
    return TYPE_LEAF;
  }
  let type = TYPE_VALUE;
  if (isMap(value)) {
    type = TYPE_MAP;
  }
  if (isArr(value)) {
    type = TYPE_ARRAY;
  }
  if (isObj(value)) {
    type = TYPE_OBJECT;
  }
  return type;
}

export function hasKey(value, key, vType: symbol | null = null) {
  if (!vType) {
    return hasKey(value, key, typeOfValue(value));
  }

  let isInValue = false;
  switch (vType) {
    case TYPE_VALUE:
      isInValue = false;
      break;

    case TYPE_OBJECT:
      isInValue = key in value;
      break;

    case TYPE_MAP:
      isInValue = value.has(key);
      break;

    case TYPE_ARRAY:
      // eslint-disable-next-line no-use-before-define
      if (!isArr(value) || isWhole(key)) {
        isInValue = false;
      } else {
        isInValue = key < value.length;
      }
      break;

    default:
      isInValue = false;
  }

  return isInValue;
}

export function isWhole(value) {
  if (!isNumber(value)) {
    return false;
  }
  return value >= 0 && !(value % 2);
}

export function amend(value, values, type = ABSENT) {
  if (!isThere(type)) {
    type = typeOfValue(value);
  }
  let out = value;
  switch (type) {
    case TYPE_MAP:
      out = new Map(value);
      values.forEach((keyValue, key) => {
        out.set(key, keyValue);
      });
      break;

    case TYPE_OBJECT:
      out = { ...value };
      Object.keys(values).forEach(key => {
        out[key] = values[key];
      });
      break;

    case TYPE_ARRAY:
      out = [...value];
      values.forEach((item, index) => {
        out[index] = item;
      });
      break;
  }
  return out;
}

export function clone(value, type = ABSENT) {
  if (!isThere(type)) {
    type = typeOfValue(value);
  }
  let out = value;
  switch (type) {
    case TYPE_MAP:
      out = new Map(value);
      break;

    case TYPE_OBJECT:
      out = { ...value };
      break;

    case TYPE_ARRAY:
      out = [...value];
      break;
  }
  return out;
}
