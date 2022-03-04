/* eslint-disable @typescript-eslint/camelcase,@typescript-eslint/no-this-alias */
import EventEmitter from 'emitix';
import { Subject, SubjectLike } from 'rxjs';
import { Change } from './Change';
import {
  getKey,
  setKey,
  toMap,
  clone,
  typeOfValue,
  isThere,
  hasKey,
} from './utils';
import { ABSENT } from './constants';

const NO_VALUE = Symbol('no value');

export default class Leaf {
  constructor(value: any, opts: any = {}) {
    this._e = new EventEmitter();
    this.value = value;
    this._version = 0;
    this._highestVersion = 0;
    this._subject = new Subject();
    this.config(opts);

    this._listenForChangeComplete();
    this._listenForUpdated();
    this._history = new Map();
    this.snapshot();
  }

  protected _e: EventEmitter<any>;

  get e() {
    return this._e;
  }

  name: any;
  config(opts: any = {}) {
    const { parent = null, branches = null, test, name } = opts;
    this._parent = parent;
    this.name = name;
    if (branches) this.addBranches(branches);
    if (typeof test === 'function') this.addTest(test);
    if (!this.name && !this.parent) {
      this.name = '[ROOT]';
    }
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

  /**
   * if no value, returns branch "name";
   * if value is a branch, injects it as a branch at name;
   * otherwise it creates a new branch with value value at name;
   *
   * if there is a '.' in the name, it recursively creates object nodes to create a nested branch.
   * @param name
   * @param value
   */
  branch(name: any, value: any = NO_VALUE) {
    if (Array.isArray(name)) {
      // @typescript-eslint/no-this-alias
      let lastBranch = this;
      name.forEach((nameItem, index) => {
        if (index === name.length - 1) {
          lastBranch = lastBranch.branch(nameItem, value);
        } else {
          const nextBranch = lastBranch.branch(nameItem);
          if (!nextBranch) {
            throw new Error(
              `cannot resolve path ${name.join(
                '.'
              )} broke at ${nameItem}:${index}`
            );
          } else {
            lastBranch = nextBranch;
          }
        }
      });
      return lastBranch;
    }
    if (typeof name === 'string' && name.indexOf('.') > 0) {
      return this.branch(name.split(/\./g), value);
    }

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
    return this.branches.get(name);
  }

  updateFromBranch(name) {
    const branch = this.branch(name);
    this.snapshot();
    this.value = setKey(clone(this._value), name, branch.value);
    this.version = Math.max(this.version, branch.version);
    this.snapshot();
  }

  public _parent: any;
  get parent(): any {
    return this._parent;
  }
  // the highest version that has ever been used; should be true for the entire tree,
  // as changes to any branch version cascade to the parent.
  // does not decline in rollback.
  public _highestVersion: number;

  // the current version of this leaf. A leaf can have children with lower version numbers than it,
  // but a leaf should never have children with higher versions than it.
  private _version: number;
  get version(): number {
    return this._version;
  }

  set version(value: number) {
    this._version = value;
    this._highestVersion = Math.max(this._highestVersion, value);
  }

  get root(): Leaf {
    if (this.parent) return this.parent.root;
    return this;
  }

  type: symbol = ABSENT;
  private _value: any;
  get value(): any {
    return this._value;
  }

  protected set value(value: any) {
    this._value = value;
    if (!isThere(this.type)) {
      this.type = typeOfValue(value);
    }
  }

  addTest(test: (any) => any) {
    this.on('change', (change: Change) => {
      const error = test(change);
      if (error) {
        change.error = error;
      }
    });
  }

  _getBranchChanges(value) {
    const branchChanges = new Map();

    if (this._branches) {
      this.branches.forEach((_, name) => {
        //@TODO: type test now?
        if (hasKey(value, name, this.type)) {
          const branchValue = getKey(value, name, this.type);
          branchChanges.set(name, branchValue);
        }
      });
    }
    return branchChanges;
  }

  _prepChanges(value, branchChanges: Map<any, any>) {
    const change = new Change(value, this);
    const changes = [change];

    const pbcKeys = Array.from(branchChanges.keys());
    for (let i = 0; i < pbcKeys.length; ++i) {
      const branchKey = pbcKeys[i];
      const branchValue = branchChanges.get(branchKey);
      const branch = this.branch(branchKey);
      const branchChange = new Change(branchValue, branch);

      changes.push(branchChange);
    }
    return changes;
  }

  next(value: any) {
    const valueType = typeOfValue(value);
    if (valueType !== this.type) {
      throw Object.assign(
        new Error(`incorrect value for leaf ${this.name || ''}`),
        {
          valueType,
          branchType: this.type,
          nextValue: value,
        }
      );
    }

    const branchChanges = this._getBranchChanges(value);
    const currentVersion = this.root.version;
    const changes = this._prepChanges(value, branchChanges);

    for (let c = 0; c < changes.length; ++c) {
      const change = changes[c];
      change.target.e.emit('change', change);
      if (change.error) {
        this.rollbackTo(currentVersion);
        throw change.error;
      }
    }

    for (let c = 0; c < changes.length; ++c) {
      const change = changes[c];
      change.target.e.emit('change-complete', change);
      change.stop();
    }
  }

  private _subject: SubjectLike<any>;

  subscribe(listener: any) {
    return this._subject.subscribe(listener);
  }

  broadcast() {
    this.e.emit('updated', this);
  }

  private _history: Map<number, any>;
  get history() {
    return this._history;
  }
  snapshot() {
    if (!this._history) this._history = new Map();
    this._history.set(this.version, this.value);
  }

  get isRoot() {
    return !this.parent;
  }

  _getSnap(version: number): { version: number; value: any } | null {
    if (this._history) {
      if (this._history.has(version)) {
        return {
          version,
          value: this._history.get(version),
        };
      }
      // return the highest snapshot that is not greater than version
      let snap = null;
      let snapVersion: number | null = null;
      this._history.forEach((value, hVersion) => {
        if (hVersion > version) return;
        // @ts-ignore
        if (snapVersion === null || snapVersion < hVersion) {
          snapVersion = hVersion;
          snap = value;
        }
      });
      if (snapVersion === null) return null;
      return { version: snapVersion, value: snap };
    }
    if (this.version <= version) {
      return {
        version: this.version,
        value: this.value,
      };
    }
    return null;
  }

  _purgeHistoryAfter(version: number) {
    if (this._history) {
      const keys = Array.from(this._history.keys());
      keys.forEach(kVersion => {
        if (typeof kVersion === 'number' && kVersion > version) {
          this._history.delete(kVersion);
        }
      });
    }
  }

  rollbackTo(version, rollingForward = false) {
    if (!rollingForward && this.parent) {
      return this.parent.rollbackTo(version);
    }
    const snap = this._getSnap(version);

    if (snap !== null) {
      this._value = snap.value;
      this.version = snap.version;
    }
    this._purgeHistoryAfter(version);

    if (this._branches) {
      this.branches.forEach(branch => {
        branch.rollbackTo(version, true);
      });
    }
  }

  _listenForChangeComplete() {
    this.e.on('change-complete', (change: Change) => {
      if (change.error) throw change.error;
      if (!change.isStopped) {
        this.value = change.value;
        this.version = this.root._highestVersion + 1;
        console.log('set', this.name, 'version to ', this.version);
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
