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
    this._version = 0;
    this._history = new Map();
    this._highestVersion = 0;
    this._subject = new Subject();
    this._transList = [];
    this._transSubject = new BehaviorSubject(new Set());
    this.config(opts);

    this._listenForChangeComplete();
    this._listenForUpdated();
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
      // chain-broadcast up the tree
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

  set value(value: any) {
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
            branchChanges.set(name, newValue);
          }
        }
      });
    }
    return branchChanges;
  }

  _prepChanges(value) {
    const branchChanges = this._getBranchChanges(value);
    const rootChange = new Change(value, this);
    /*
    note - rootChange will/should be redundant with any observed branchChanges.
    */

    const childChanges: Change[] = [];

    /*
    transmute the keyName, newValue map returned by getBranchChanges
    into an array of changes
     */
    branchChanges.forEach((newValue, branchKey) => {
      childChanges.push(new Change(newValue, this.branch(branchKey)));
    });

    return {
      rootChange,
      childChanges,
    };
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

    /*
    The change is split between the root change - properties /values that 
    aren't managed by sub-branches - and childChanges - those that are.
    childChanges may be an empty set. 
    
    The reason for the split is that branch leafs may have their own tests
    that must be passed 
     */
    const { rootChange, childChanges } = this._prepChanges(value);

    this.transact(() => {
      rootChange.target.e.emit('change', rootChange);
      if (rootChange.error) throw rootChange.error;
      rootChange.target.e.emit('change-complete', rootChange);
      childChanges.forEach(childChange => {
        childChange.target.e.emit('change', childChange);
        if (childChange.error) throw childChange.error;
        childChange.target.e.emit('change-complete', childChange);
        childChange.stop();
      });
      rootChange.stop();
    });
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

  transact(fn) {
    const startVersion = this.version;
    const token = this.pushTrans(
      Symbol(`leaf ${this.name}, version ${startVersion}`)
    );
    try {
      fn();
      this.popTrans(token);
    } catch (err) {
      this.rollbackTo(startVersion);
      this.popTrans(token);
      throw e(err, { leaf: this });
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
        if (kVersion > version) {
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
