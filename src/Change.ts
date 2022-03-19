import { ABSENT, CHANGE_ABSOLUTE } from './constants';
import { LeafType } from './types';
import { isCompound, makeValue } from './utils';

export class Change {
  constructor(value: any, target: any, next: any = ABSENT) {
    this.value = value;
    this.next = next === ABSENT ? value : next;
    this.versionBeforeChange = target.version;
    this.target = target;
    this._error = null;
    this.status = 'live';
  }

  public next: any; // the target's previous value blended with value - or value
  public target: any;
  public value: any; // the change definition - a partial or total replacement for the target's vlaue
  private _error: any;
  public status: string;
  public versionBeforeChange: number;
  get error(): any {
    return this._error;
  }

  set error(value: any) {
    if (this.status !== 'live') return;
    this.status = 'error';
    this._error = value;
  }

  stop() {
    if (this.status === 'live') {
      this.status = 'stopped';
    }
  }

  complete() {
    if (this.status === 'live') {
      this.target.e.emit('change-complete', this);
      this.stop();
    }
  }

  get isStopped() {
    return !!(this._error || this.status !== 'live');
  }

  public static create(target: LeafType, value, direction) {
    let updatedValue = value;

    if (
      direction !== CHANGE_ABSOLUTE &&
      target.initialized &&
      isCompound(target.form)
    ) {
      try {
        updatedValue = makeValue(target.value, value);
      } catch (err) {
        updatedValue = value;
      }
    }
    target.emit('debug', [
      'Leaf --- >>> _makeChange setting value from ',
      target.value,
      ' to ',
      updatedValue,
      'from ',
      value,
    ]);
    return new Change(value, target, updatedValue);
  }
}
