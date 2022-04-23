import {LeafV2ConfigType, LeafV2Interface, SnapshotStatus, SnapshotType} from './types';
import Snapshot from './Snapshot';
import EventEmitter from 'emitix';
import {getOrCatch} from "./utils";

export class LeafV2 extends EventEmitter.Protected<{
  snapshot: [SnapshotType],
  error: [Error]
}>() implements LeafV2Interface {
  _history: SnapshotType[] = [];

  constructor(value, config?: LeafV2ConfigType) {
    super();
    this.addSnapshot(value);
    this.config(config)
  }

  addSnapshot(change, status = SnapshotStatus.pending) {
    if (!this._history.length) {
      status = SnapshotStatus.current;
    }
    const snap = new Snapshot(this, change, status);
    this._history.push(snap);
    this.emit('snapshot', snap)
    return snap;
  }

  /**
   * the most recent NON REVERTED snapshot;
   */
  get latest() {
    if (!this._history.length) return null;
    let index = this._history.length - 1;
    while (index >= 0) {
      if (this._history[index].status === SnapshotStatus.revoked) {
        --index;
      } else {
        break;
      }
    }
    if (index < 0) return null;
    return this._history[index];
  }

  /**
   * the snapshot at the end of the stack - regardless of status
   */
  get last() {
    if (!this._history.length) return null;
    const index = this._history.length - 1;
    return this._history[index];
  }

  get value() {
    return this.latest?.value;
  }

  get baseValue() {
    return this.latest?.baseValue;
  }

  get version() {
    return this.latest?.version;
  }

  get errors() {
    return this.last?.errors || [];
  }

  revertTo(version) {
    this._history.forEach(snap => {
      if (snap.version > version) {
        snap.status = SnapshotStatus.revoked;
      }
    });
  }

  next(value) {
    const version = this.version;
    this.addSnapshot(value);
    if (this.errors?.length) {
      this.revertTo(version);
      throw this.errors;
    }
  }

  private config(config?: LeafV2ConfigType) {
    if (!config) return;

    const {test} = config;
    if (test) this.addTest(test);
  }

  addTest(test) {
    if (typeof test === 'function') {
      const listener = (snap) => {
        const err = getOrCatch(() => test(snap.baseValue, this));
        if (err) {
          snap.addError(err);
        }
      }
      this.on('snapshot', listener);
      return listener;
    }
    return null;
  }
}
