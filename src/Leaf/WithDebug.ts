import { ABSENT } from '../constants';
import { LeafType } from '../types';
import { isNum, isObj, isThere, toArr } from '../utils';

function sayDebug(val: any, target: LeafType) {
  if (!target.debug || target.isStopped) {
    return;
  }

  let logArgs = toArr(val);
  let numCrit: number | null = null;
  let withJ = false;

  if (isObj(val)) {
    let isParam = false;
    const { message = ABSENT, n = ABSENT, j = ABSENT } = val;
    if (isThere(message)) {
      logArgs = toArr(val.message);
      isParam = true;
    }
    if (isThere(n) && isNum(n)) {
      numCrit = n;
      isParam = true;
    }
    if (isThere(j)) {
      withJ = j;
      isParam = true;
    }

    if (!isParam) {
      // object is NOT a debug crit - treat it as a "thing to echo"
      logArgs = [val];
    }
  }

  // @ts-ignore
  if (numCrit && target.debug < numCrit) return;

  if (withJ) {
    logArgs.push(target.toJSON(true));
  }

  console.log(...logArgs);
}

export default function WithDebug(Cons) {
  return class LeafWithDebug extends Cons {
    public debug = false;
    public _listeningForDebug = false;

    config(opts) {
      super.config(opts);
      if (isObj(opts)) {
        this.debug = opts.debug;
        if (!this._listeningForDebug && this.debug) {
          // @ts-ignore
          this.on('debug', val => sayDebug(val, this));
          this._listeningForDebug = true;
        }
      }
    }
  };
}
