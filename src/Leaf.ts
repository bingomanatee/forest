/* eslint-disable @typescript-eslint/camelcase */
import EventEmitter from 'emitix';
import { Subject, SubjectLike } from 'rxjs';
import { Change } from './Change';
import { getKey, setKey, toMap } from './utils';

const NO_VALUE = Symbol('no value');

export default class Leaf {
  constructor(value: any, opts: any = {}) {
    this._e = new EventEmitter();
    this._value = value;
    this._version = 0;
    this._subject = new Subject();
    this.config(opts);

    this._listenForChangeComplete();
    this._listenForUpdated();
  }

  protected _e: EventEmitter<any>;

  get e() {
    return this._e;
  }

  config(opts: any = {}) {
    const { parent = null, branches = null } = opts;
    this._parent = parent;
    if (branches) this.addBranches(branches);
  }

  protected on(event: string, listener: (arg0: Change) => void) {
    this.e.on(event, value => {
      if (value instanceof Change && value.isStopped) {
        // don't listen
      } else {
        listener(value);
      }
    });
  }

  private _branches: Map<any, any> | undefined;
  get branches(): Map<any, any> {
    if (!this._branches) this._branches = new Map();
    return this._branches;
  }

  addBranches(branches) {
    if (Array.isArray(branches)) {
      branches.forEach(name => {
        const value = getKey(this._value, name);
        this.branch(name, value);
      });
    } else {
      toMap(branches).forEach((branch, name) => {
        this.branch(name, branch);
      });
    }
  }

  branch(name: any, value: any = NO_VALUE) {
    if (value !== NO_VALUE) {
      const branch =
        value instanceof Leaf ? value : new Leaf(value, { parent: this, name });
      branch.config({ name, parent: this });
      this.branches.set(name, branch);
      branch.on('updated', () => {
        this.updateFromBranch(name);
        this.broadcast();
      });
      this.updateFromBranch(name);
    }
    return this._branches ? this.branches.get(name) : undefined;
  }

  updateFromBranch(name) {
    const branch = this.branch(name);
    this._value = setKey(this._value, name, branch.value);
    this._version = Math.max(branch.version, this.rootVersion + 1);
  }

  public _parent: any;
  get parent(): any {
    return this._parent;
  }

  private _version: number;
  get version(): number {
    return this._version;
  }

  get rootVersion(): number {
    if (!this.parent) {
      return this.version;
    }
    return this.parent.rootVersion;
  }

  set version(value: number) {
    this._version = value;
  }

  private _value: any;
  get value(): any {
    return this._value;
  }

  set value(value: any) {
    const change = new Change(value, this);
    this.e.emit('change', change);
    if (change.error) throw change.error;
    this.e.emit('change-complete', change);
  }

  private _subject: SubjectLike<any>;

  subscribe(listener: any) {
    return this._subject.subscribe(listener);
  }

  broadcast() {
    this.e.emit('updated', this);
  }

  _listenForChangeComplete() {
    this.e.on('change-complete', (change: Change) => {
      if (change.error) throw change.error;
      if (!change.isStopped) {
        this._value = change.value;
        this._version = change.versionTo;
        this.broadcast();
      }
    });
  }

  _listenForUpdated() {
    this.on('updated', () => {
      if (this._subject) {
        this._subject.next(this.value);
      }
    });
  }
}
