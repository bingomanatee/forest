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
  makeValue,
  e,
  keys,
  ucFirst,
  isObj,
  isFn,
} from './utils';
import {
  ABSENT,
  CHANGE_DOWN,
  CHANGE_UP,
  TYPE_ARRAY,
  TYPE_MAP,
  TYPE_OBJECT,
} from './constants';

const NO_VALUE = Symbol('no value');

export default class Leaf {
  constructor(value: any, opts: any = {}) {
    this._e = new EventEmitter();
    this.value = value;
    this._history = new Map();
    this._subject = new Subject();
    this._transList = [];
    this.config(opts);

    this._listenForUpdated();
    this.version = 0;
    this.snapshot(0);
    if (!this.root._initialized) {
      this._flushJournal();
    }
    this._initialized = true;
  }

  /* ---------- identity / config ------------------ */
  debug: any;
  _initialized = false;
  name: any;

  bugLog(...args) {
    if (this.debug) {
      console.log(...args);
    }
  }

  bugLogN(n, ...args) {
    if (this.debug >= n) {
      console.log(...args);
    }
  }

  bugLogJ(...args) {
    if (this.debug) {
      console.log(...args, this.root.toJSON(true));
    }
  }

  config(opts: any = {}) {
    const { parent = null, branches = null, test, name, actions, debug } = opts;
    this._parent = parent;

    this.debug = debug;
    this.name = name;
    if (!this.name && !this.parent) {
      this.name = '[ROOT]';
    }

    if (branches) this.addBranches(branches);
    if (typeof test === 'function') this.addTest(test);

    if (isObj(actions)) {
      Object.keys(actions).forEach(key => {
        const fn = actions[key];
        if (isFn(fn)) {
          this.addAction(key, fn);
        } else {
          console.warn('bad action value for ', key, ', value must be fn', fn);
        }
      });
    }
  }

  /* -------------- event ------------- */

  protected _e: EventEmitter<any>;

  get e() {
    return this._e;
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

  _flushJournal() {
    this._version = 0;
    this._highestVersion = 0;
    this._history.clear();
    this._dirty = false;
    this.snapshot(0);
    this.branches.forEach(b => b._flushJournal());
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
      branch._changeDown();
    }
    return this.branches.get(name);
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
    if (value > this.root.highestVersion) this.root.highestVersion = value;
  }

  get root(): Leaf {
    if (this.parent) return this.parent.root;
    return this;
  }

  type: symbol = ABSENT;
  private _value: any = ABSENT;
  public _dirty = false;

  get value(): any {
    return this._value;
  }

  set value(value: any) {
    const valueType = typeOfValue(value);
    if (this._value === value) return;
    if (!isThere(this.type)) {
      this.type = valueType;
    } else if (this._initialized && valueType !== this.type) {
      throw e(`cannot change type of ${this.name} once it has been set`, {
        target: this,
        currentType: this.type,
        value: value,
        valueType,
      });
    }
    this._value = value;
    if (this._initialized) this._dirty = true;
  }

  addTest(test: (any) => any) {
    this.on('change', (change: Change) => {
      const error = test(change);
      if (error) {
        change.error = error;
      }
    });
  }

  get historyString() {
    let out = '';
    this.history.forEach((value, key) => {
      out += `${key} -> ${JSON.stringify(value)}, `;
    });

    return out;
  }

  toJSON(network = false) {
    if (network && this.branches.size) {
      const out = this.toJSON();
      out.branches = [];
      this.branches.forEach(b => {
        out.branches.push(b.toJSON(true));
      });
      return out;
    }

    const out = {
      name: this.name,
      value: this.value,
      version: this.version,
      history: this.historyString,
    };
    if (this._dirty) {
      // @ts-ignore
      out.dirty = true;
    }
    if (!this.parent || !network) {
      // @ts-ignore
      out.highestVersion = this.highestVersion;
    }
    return out;
  }

  /* ---------------------------- next ---------------------------- */

  /**
   * `next` submits a new value. In this order:
   * note: every time you update value its leaf is marked as 'dirty"
   * to flag it as having been changed for step 4.
   *
   * - the short version is:
   * - update values up and down the tree,
   *     flagging changes as dirty and validating as we go
   * - advance the version of dirty values
   * - journal the changes
   * - broadcast to any subscribers
   *
   * 1. calls _checkType to validate the new format (array, Map, object, scalar) is the same as the old one.
   * 2. _changeValue: inside a transaction (traps any thrown error into rootChange)
   *    a. set the value passed in; merges any structures(objects/maps) from previous values.
   *    b. creates a rootChange
   *       emit('change', rootChange) -- triggers any tests which may throw
   *    c. _changeUp(value) -- update changed fields to branches,
   *       recursively changeUp for any subProps
   *    d. _changeDown()
   *        i. _changeFromBranch(this);
   *        ii. inject this updated value into its parent
   *        iii. parent.next(updated, CHANGE_DOWN) prevents recursive _changeDown
   * 4  if not in a transaction (outermost next)
   *    a. advance() journals all dirty leafs. for each changed value in the tree:
   *       i. sets the version to (highestVersion + 1
   *       ii.. snapshots value/version
   *    b. broadcast() 'change-complete' (change) to subject
   * (on any thrown error)
   *    transact()'s wrapper will rollback all in-process value changes
   *    to their previous state from the history journal.
   */

  /**
   * get a map of change objects for each property in value
   * that has been changed by the value from the current value of that branch.
   *
   * If there are no branches, or none of the branch fields have been changed,
   * this method will return an empty Map.
   * @param value
   */
  _getBranchChanges(value): Map<Leaf, any> {
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

  /**
   * insures that the value is the same type as the leaf's current value
   * @param value
   */
  _checkType(value) {
    const valueType = typeOfValue(value);
    if (valueType !== this.type) {
      throw e(`incorrect value for leaf ${this.name || ''}`, {
        valueType,
        branchType: this.type,
        nextValue: value,
      });
    }
  }

  /**
   * breaks any fields that affect sub-branches
   * and updates them
   * @param value
   */
  _changeUp(value) {
    const branchMap = this._getBranchChanges(value);
    branchMap.forEach((newValue, branch) => {
      branch._changeValue(newValue, CHANGE_UP); // can throw;
    });
  }

  _changeFromBranch(branch) {
    if (branch.name && this.branch(branch.name) === branch) {
      const value = clone(this.value);
      setKey(value, branch.name, branch.value, this.type);
      this.next(value, CHANGE_DOWN);
    }
  }

  _changeDown() {
    if (this.parent) {
      this.parent._changeFromBranch(this);
    }
  }

  _changeValue(value, direction = ABSENT) {
    this.transact(() => {
      const updatedValue = !this._initialized
        ? value
        : makeValue(value, this.value);
      this.bugLog(
        '--- >>> setting value from ',
        this.value,
        ' to ',
        updatedValue,
        'from ',
        value
      );
      this.value = updatedValue;
      // a map of branch: newValue key pairs.
      // the entire branch is saved as a key for convenience
      const rootChange = new Change(value, this);
      try {
        rootChange.target.e.emit('change', rootChange);
        if (rootChange.error) throw rootChange.error;
        if (direction !== CHANGE_DOWN) {
          this._changeUp(value);
        }
        if (direction !== CHANGE_UP) {
          this._changeDown();
        }
      } catch (err) {
        if (!rootChange.isStopped) {
          rootChange.error = err;
        }
        throw err;
      }
      rootChange.complete();
    });
  }

  /**
   * updates the value of this branch.
   * @param value
   * @param direction
   */
  next(value: any, direction: symbol = ABSENT) {
    if (!this.root._initialized) {
      this.value = value;
      return;
    }
    this.bugLog('setting ', this.name, 'to', value, direction);

    this._checkType(value);

    this._changeValue(value, direction);
    if (!this.inTransaction) {
      this.bugLogJ(
        `done with set value: ${value} of ${this.name}not in trans - advancing`
      );

      this.root.advance(this.highestVersion + 1);
      this.broadcast();
      this.bugLog('--- post advance: ', true);
    } else {
      this.bugLog('---------- done with next; still in transaction');
    }
  }

  /**
   * snapshots all "dirty" branches with the passed-in version and updates the
   * version of the branch.
   * @param version
   */
  advance(version): boolean {
    let newDirty = false;

    // at this point the version is the next highest and at parent OR forward
    if (this._dirty) {
      this.version = version;
      this._dirty = false;
      this.snapshot(version);
      newDirty = true;
    }
    this.branches.forEach(branch => {
      if (branch.advance(version)) newDirty = true;
    });

    return newDirty;
  }

  /* -------------------- transactions ------------------- */

  /*
    transactions are global and managed from the root of the tree.
    They are stored in an array and tracked in a BehaviorSubject 
    that stores a set from that array. 
    
    The nature of what token is stored in the array is not really important
    as long as its referentially unique; as such, symbols make good 
    transaction tokens. 
     */

  private _transSubject: SubjectLike<Set<any>> | null = null;

  /**
   * a broadcaster of the current state;
   */
  get transSubject() {
    if (this.parent) {
      return this.parent.transSubject;
    }
    if (!this._transSubject) {
      this._transSubject = new BehaviorSubject(new Set(this.transList));
    }

    return this._transSubject;
  }

  /**
   * transList points to the root's private _transList property.
   * @param list
   */

  private _transList: any[];
  get transList() {
    return this.root._transList;
  }

  set transList(list) {
    this.bugLogN(1, '---->>> translist = ', list);
    this.root._transList = list;
    this.transSubject.next(new Set(list));
  }

  /**
   * token is an arbitrary object that is referentially unique. An object, Symbol. Not a scalar (string/number).
   * The significant trait of token is that when you popTrans (remove it from the trans collection,
   * it (AND ONLY IT) are removed.
   *
   * @param token
   */
  pushTrans(token: any) {
    this.bugLogN(2, 'PushTrans: ', token, 'into', this.transList);
    this.transList = [...this.transList, token];
    return token;
  }

  /**
   * remove a trans from the root collection
   * @param token
   */
  popTrans(token: any) {
    this.bugLogN(2, 'popTrans: ', token, 'from', this.transList);
    this.transList = this.transList.filter(t => t !== token);
    return token;
  }

  get inTransaction() {
    return !!this.transList.length;
  }

  /**
   * executes a function in a "transient state", popping and pushing a token into
   * the transList; this has a side effect of changing the transSubjects' state as well,
   * which will block some actions including updating the broadcast subject.
   *
   * Transactions may be nested, populating the list with multiple tokens.
   * The only thing that matters is that until the last token clears,
   * the tree is considered to be "in transaction."
   *
   * - The function that is passed into transact must be synchronous.
   * - If the function does not throw, its value is returned from transact.
   * - Throwing functions still remove the token from the transList before throwing.
   *
   * @param fn
   */
  transact(fn) {
    const startVersion = this.root.highestVersion;
    const token = this.pushTrans(
      Symbol(`leaf ${this.name}, version ${startVersion}`)
    );
    let out;
    try {
      out = fn();
    } catch (err) {
      this.popTrans(token);
      this.rollbackTo(startVersion);
      throw e(err, { leaf: this });
    }
    this.popTrans(token);
    return out;
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

  snapshot(version = 0) {
    if (!this._history) this._history = new Map();
    this._history.set(version, this.value);
  }

  get isRoot() {
    return !this.parent;
  }

  /**
   * returns the latest snapshot tuple whose version <= version.
   * @param version
   * @returns {{vetsion: number, value: any} | null}
   */
  _getSnap(version: number): { version: number; value: any } | null {
    if (this._history) {
      if (this._history.has(version)) {
        return {
          version,
          value: this._history.get(version),
        };
      }

      let foundValue = null;
      let foundVersion: number | null = null;
      this._history.forEach((value, hVersion) => {
        if (hVersion > version) return;
        // @ts-ignore
        if (foundVersion === null || foundVersion < hVersion) {
          foundVersion = hVersion;
          foundValue = value;
        }
      });
      if (foundVersion === null) return null;
      return { version: foundVersion, value: foundValue };
    }
    if (this.version <= version) {
      return {
        version: this.version,
        value: this.value,
      };
    }
    return null;
  }

  /**
   * remove history entries older than a given number
   * @param version
   */
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

  /**
   * resets all branches by resetting their value to the first one
   * whose version is <= the target.
   *
   * @param version {number}
   * @param rollingForward {boolean}
   */
  rollbackTo(version: number, rollingForward = false) {
    if (!rollingForward) {
      this.bugLogJ('< < < < < < rolling back ', version);
      this.root.rollbackTo(version, true);
      this.bugLog('< < < < < < post rolling back: ');

      return;
    }

    // either  at parent, or rolling forward from parent

    if (this.version > version) {
      // at this point we do have a value that needs to be redacted

      const snap = this._getSnap(version);

      if (snap !== null) {
        this._value = snap.value;
        this._version = snap.version;
      }
      this._purgeHistoryAfter(version);
    }

    this.branches.forEach(branch => {
      branch.rollbackTo(version, true);
    });
  }

  _listenForUpdated() {
    this.on('updated', () => {
      if (this._subject && !this.inTransaction) {
        this._subject.next(this.value);
      }
    });
  }

  /* ------------------- Actions --------------------- */

  private _$do: any;
  get $do(): any {
    if (!this._$do) {
      this._$do = {};
      this.inferActions();
    }
    return this._$do;
  }

  inferActions() {
    const valKeys = keys(this.value);

    valKeys.forEach(key => {
      this.addAction(`set${ucFirst(key)}`, (leaf, value) => {
        return leaf.set(key, value);
      });
    });
  }

  addAction(name: string, fn): boolean {
    try {
      this.$do[name] = (...args) => this.transact(() => fn(this, ...args));
      this.bugLog('$do sdvanced to ', this.$do, 'from', name);
      return true;
    } catch (err) {
      console.warn('cannot addAction', name, fn);
      return false;
    }
  }

  set(name, value: any) {
    if (this._branches && this._branches.has(name)) {
      this.branch(name).next(value);
    } else {
      switch (this.type) {
        case TYPE_OBJECT:
          this.next({ [name]: value });
          break;

        case TYPE_MAP:
          this.next(new Map([[name, value]]));
          break;

        case TYPE_ARRAY:
          const next = [...this.value];
          if (typeof name === 'number') {
            if (Array.isArray(value)) {
              next.splice(name, value.length, ...value);
            } else {
              next[name] = value;
            }
            this.next(next);
          } else {
            console.warn('set (array) with non-numeric index');
          }
          break;

        default:
          console.warn('set attempted on subject of type', this.type);
      }
    }
    return this;
  }
}
