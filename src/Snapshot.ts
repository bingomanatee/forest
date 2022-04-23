import { ABSENT } from './constants';
import { LeafV2Interface, SnapshotStatus } from './types';

export default class Snapshot {
  public version: number;
  public status: SnapshotStatus;
  public change: any;
  public errors: any[] = [];

  private _baseValue: any = ABSENT;
  private _value: any = ABSENT;
  private target: LeafV2Interface;

  constructor(
    target: LeafV2Interface,
    change,
    status = SnapshotStatus.pending
  ) {
    this.target = target;
    this.change = change;
    this.status = status;
    if (!this.target.version) {
      this.version = 1;
    } else {
      this.version = this.target.version + 1;
    }
  }

  get baseValue() {
    if (this._baseValue === ABSENT) {
      this._baseValue = this.change;
    }
    return this._baseValue;
  }

  get value() {
    if (this._value === ABSENT) {
      this._value = this.baseValue;
    }
    return this._value;
  }

  addError(err) {
    if (err) this.errors.push(err);
  }
}
