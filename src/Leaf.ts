/* eslint-disable @typescript-eslint/camelcase,@typescript-eslint/no-this-alias */
import EventEmitter from 'emitix';
import { BehaviorSubject, Subject, SubjectLike } from 'rxjs';
import { Change } from './Change';
import {
  getKey,
  setKey,
  toMap,
  clone,
  typeOfValue,
  isThere,
  hasKey,
  e,
} from './utils';
import { ABSENT } from './constants';

const NO_VALUE = Symbol('no value');

export default class Leaf {
  constructor(value: any, opts: any = {}) {
    this._e = new EventEmitter();
    this.value = value;
    this._history = new Map();
    this._subject = new Subject();
    this._transList = [];
    this._transSubject = new BehaviorSubject(new Set());
    this.config(opts);

    this._listenForChangeComplete();
    this._listenForUpdated();
    this.version = 0;
    this.snapshot();
    this._initialized = true;
  }

  _initialized = false;
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
      // chain-broadcast up the tree
      branch.on('updated', () => {
        this.updateFromBranch(name);
      });
      this.updateFromBranch(name);
    }
    return this.branches.get(name);
  }

  updateFromBranch(name) {
    const branch = this.branch(name);
    if (!branch) return;
    this.next(setKey(clone(this.value), name, branch.value));
  }

  public _parent: any;
  get parent(): any {
    return this._parent;
  }

  /*  
    the highest version that has ever been used;
    should be true for the entire tree,
    as changes to any branch version cascade to the parent,
    as do get attempts.
    highestVersion does not decline in rollback.
    */
  private _highestVersion = 0;
  get highestVersion(): number {
    if (this.parent) return this.parent.highestVersion;
    return this._highestVersion;
  }

  set highestVersion(value: number) {
    if (value > this._highestVersion) {
      this._highestVersion = value;
    }
    if (this.parent) {
      this.parent.highestVersion = value;
    }
  }

  // the current version of this leaf. A leaf can have children with lower version numbers than it,
  // but a leaf should never have children with higher versions than it.
  private _version = 0;
  get version(): number {
    return this._version;
  }

  set version(value: number) {
    if (!this.root._initialized) {
      this._version = 0;
      return;
    }
    this._version = value;
    if (value > this.highestVersion) this.highestVersion = value;
  }

  get root(): Leaf {
    if (this.parent) return this.parent.root;
    return this;
  }

  type: symbol = ABSENT;
  private _value: any = ABSENT;
  public _dirty = -1;
  get value(): any {
    return this._value;
  }

  set value(value: any) {
    const valueType = typeOfValue(value);
    if (this._value === value) return;
    if (!isThere(this.type)) {
      this.type = valueType;
    } else if (valueType !== this.type) {
      throw e(`cannot change type of ${this.name} once it has been set`, {
        target: this,
        currentType: this.type,
        value: value,
        valueType,
      });
    }
    this._value = value;
    this._dirty = this.highestVersion + 1;
  }

  addTest(test: (any) => any) {
    this.on('change', (change: Change) => {
      const error = test(change);
      if (error) {
        change.error = error;
      }
    });
  }

  /* ---------------------------- next ---------------------------- */

  /**
   * `next` submits a new value. In this order:
   *
   *  inside a transaction:
   *  1. the leaf's value is set to the incoming value
   *     a) emit a "change" with the value targeting the current branch
   *     b) if an error is generated by tests, throw it (and stop here)
   *
   *  2. for each of the branches that have different values than
   *     their analog in value
   *     a) call 'next' with that subfield value; which can cascade upwards
   *  3. completes the change from 1.a
   *     a) advances version to 1+ highest of root
   *     b) calls `broadcast()`, emitting 'updated'.
   *        i. sends a value out of the subject
   *        ii. if this is a branch, its parent calls updateFromBranch(name).
   *              - parent `setKey()`'s the branches' value into lodash.clone of this value (for safety)
   *              - parent.snapshot()s the current state
   *              - parent.broadcasts(),recursing up the chain to the root
   *
   */

  /**
   * get a map of change objects for each property in value
   * that has been changed by the value from the current value of that branch.
   *
   * If there are no branches, or none of the branch fields have been changed,
   * this method will return an empty Map.
   * @param value
   */
  _getBranchChanges(value): Map<any, any> {
    const branchChanges = new Map();

    if (this._branches) {
      this.branches.forEach((branch, name) => {
        //@TODO: type test now?
        if (hasKey(value, name, this.type)) {
          const newValue = getKey(value, name, this.type);
          if (newValue !== branch.value) {
            branchChanges.set(branch, newValue);
          }
        }
      });
    }
    return branchChanges;
  }

  next(value: any) {
    const valueType = typeOfValue(value);
    if (valueType !== this.type) {
      throw e(`incorrect value for leaf ${this.name || ''}`, {
        valueType,
        branchType: this.type,
        nextValue: value,
      });
    }

    // a map of branch: newValue key pairs.
    // the entire branch is saved as a key for convenience
    const branchMap = this._getBranchChanges(value);
    const rootChange = new Change(value, this);

    this.transact(() => {
      try {
        this.value = value;
        rootChange.target.e.emit('change', rootChange);
        if (rootChange.error) throw rootChange.error;
        branchMap.forEach((newValue, targetBranch) => {
          targetBranch.next(newValue); // can throw;
        });
        rootChange.complete(); // <-- sets value, version;
        // broadcasts change upwards to parent
      } catch (error) {
        if (!rootChange.isStopped) {
          rootChange.error = error;
          this.rollbackTo(rootChange.versionBeforeChange);
        }
        throw error;
      }
    });

    if (!this.inTransaction) {
      this.advance(0);
    }
  }

  advance(version = 0, forward = false) {
    if (!forward && this.parent) {
      this.parent.advance();
      return;
    }
    if (version === 0) {
      this.advance(this.highestVersion + 1);
      return;
    }

    // at this point the version is the next highest and at parent OR forward
    if (this._dirty > 0) {
      this.version = version;
      this.snapshot();
      this._dirty = 0;
      this.branches.forEach(branch => branch.advance(version, true));
    }
  }

  private _transSubject: SubjectLike<Set<any>>;
  private _transList: any[];
  get transList() {
    return this._transList;
  }

  set transList(list) {
    this._transList = list;
    this._transSubject.next(new Set(this._transList));
  }

  /**
   * token is an arbitrary object that is referentially unique. An object, Symbol. Not a scalar (string/number).
   * The significant trait of token is that when you popTrans (remove it from the trans collection, it (AND ONLY IT)
   * are removed.
   *
   * Note -- all transactions are managed in the root leaf.
   * This means any transactional activity blocks all leaf activity
   * until the root transaction collection is cleared.
   *
   * @param token
   */
  pushTrans(token: any) {
    if (this.parent) return this.parent.pushTrans(token);
    if (!token) return this.pushTrans(Symbol('trans'));

    // this is the root, and token is .... something

    this.transList = [...this.transList, token];
    return token;
  }

  /**
   * clear the trans from the root collection
   * @param token
   */
  popTrans(token: any) {
    if (!token) return;
    if (this.parent) {
      return this.parent.popTrans(token);
    }

    // at the root

    // set transList to itself without token
    this.transList = this.transList.filter(t => t !== token);
    return token;
  }

  get inTransaction() {
    return !!this.transList.length;
  }

  transact(fn) {
    const startVersion = this.version;
    const token = this.pushTrans(
      Symbol(`leaf ${this.name}, version ${startVersion}`)
    );
    try {
      fn();
    } catch (err) {
      this.popTrans(token);
      this.rollbackTo(startVersion);
      throw e(err, { leaf: this });
    }
    this.popTrans(token);
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
        if (kVersion > version) {
          this._history.delete(kVersion);
        }
      });
    }
    if (this._dirty >= version) this._dirty = -1;
  }

  rollbackTo(version, rollingForward = false) {
    if (!rollingForward && this.parent) {
      return this.parent.rollbackTo(version);
    }

    // either  at parent, or rolling forward from parent

    if (this.version <= version) {
      // if already at or before the target,
      // neither this branch NOR its children require rolling back
      return;
    }

    // at this point we do have a value that needs to be redacted

    const snap = this._getSnap(version);

    if (snap !== null) {
      this.value = snap.value;
      this._version = snap.version;
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
        this.broadcast();
      }
    });
  }

  _listenForUpdated() {
    this.on('updated', () => {
      if (this._subject && !this.inTransaction) {
        this._subject.next(this.value);
      }
    });
  }
}
