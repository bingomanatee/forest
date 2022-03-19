/* eslint-disable @typescript-eslint/camelcase,@typescript-eslint/no-this-alias */
import EventEmitter from 'emitix';
import { BehaviorSubject, distinctUntilChanged, map, SubjectLike } from 'rxjs';
import { Change } from './Change';
import {
  clone,
  delKeys,
  detectForm,
  detectType,
  e,
  flattenDeep,
  getKey,
  hasKey,
  isArr,
  isCompound,
  isFn,
  isObj,
  isThere,
  keys,
  makeValue,
  setKey,
  testForType,
  toMap,
  ucFirst,
} from './utils';
import {
  ABSENT,
  CHANGE_ABSOLUTE,
  CHANGE_DOWN,
  CHANGE_UP,
  FORM_ARRAY,
  FORM_MAP,
  FORM_OBJECT,
  TYPE_ANY,
} from './constants';
import { SelectorType, symboly } from './types';
import WithDebug from './Leaf/WithDebug';

const NO_VALUE = Symbol('no value');

// @ts-ignore
@WithDebug
export default class Leaf {
  /* ---------- identity / config ------------------ */
  debug: any;
  _initialized = false;
  name: any;
  type?: symboly;
  form?: symboly;

  /* -------------- selector ---------- */
  public _dirty = false;
  private _inferredActions: any = null;
  private _userActions: any = null;

  constructor(value: any, opts: any = {}) {
    this._e = new EventEmitter();
    this.debug = !!opts.debug;
    this.value = value;
    this._transList = [];
    this.config(opts);

    this._listenForUpdated();
    this.version = 0;
    this.snapshot(0);
    if (!this.root._initialized) {
      this._flushJournal();
    }

    switch (this.form) {
      case FORM_OBJECT:
        this.inferActions();
        break;

      case FORM_MAP:
        this.inferActions();
        break;
    }

    this._initialized = true;
  }

  /* -------------- event ------------- */

  private _selectors?: Map<any, SelectorType> | null;

  get selectors(): Map<any, SelectorType> {
    if (!this._selectors) {
      this._selectors = new Map();
    }
    return this._selectors;
  }

  protected _e: EventEmitter<any>;

  get e() {
    return this._e;
  }

  private _branches: Map<any, any> | undefined;
  get branches(): Map<any, any> {
    if (!this._branches) this._branches = new Map();
    return this._branches;
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

  get maxVersion() {
    return this.root._maxVersion();
  }

  private _version: number | null = 0;

  get version(): number | null {
    return this._version;
  }

  set version(value: number | null) {
    if (!this.root._initialized) {
      this._version = 0;
      return;
    }
    this._version = value;
    if (value !== null && value > this.root.highestVersion) {
      this.root.highestVersion = value;
    }
  }

  get root(): Leaf {
    if (this.parent) return this.parent.root;
    return this;
  }

  public _value: any = ABSENT;

  /*
  the current version of this leaf. A leaf can have children with lower version numbers than it,
  but a leaf should never have children with higher versions than it.
  note - version is set to null for transient values inside a transact(); the outermost transact
  will advance all dirty data to the next version, and rollback will purge it back to a known prior one.
*/

  get value(): any {
    return this._value;
  }

  /**
   * updates the value of this form. There may be a brief inconsistency as
   * the values of the update are sent out to the branches which can reinterpret them.
   * @param value
   */
  set value(value: any) {
    if (this._value === value) return;
    if (!this.form) this.form = detectForm(value);
    this._value = value;
    if (this._initialized) this._dirty = true;
  }

  get historyString() {
    let out = '';
    this.history.forEach((value, key) => {
      out += `${key} -> ${JSON.stringify(value)}, `;
    });

    return out;
  }

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
    if (this.isRoot) {
      this.emit('debug', { n: 1, message: ['---->>> translist = ', list] });
      this._transList = list;
      this.transSubject.next(new Set(list));
    } else this.root.transList = list;
  }

  get inTransaction() {
    return !!this.transList.length;
  }

  private _subject: SubjectLike<any> | null = null;

  get subject(): SubjectLike<any> {
    if (!this._subject) {
      this._subject = new BehaviorSubject(this.value);
    }
    return this._subject;
  }

  private _history?: Map<number, any>;

  get history() {
    if (!this._history) this._history = new Map();
    return this._history;
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
   *
   * next() is transactional wrapped, so in the absence of errors it will:
   * - advance the version of dirty values
   * - journal the changes
   * - broadcast to any subscribers
   *
   * the long version: next
   * 1. calls _checkType to validate the new format (array, Map, object, scalar) is the same as the old one.
   * 2. _changeValue: inside a transaction (traps any thrown error into rootChange) which executes the following:
   *    (in a transaction)
   * 3. set the value passed in; merges any structures(objects/maps) from previous values.
   * 4. creates a rootChange
   *       emit('change', rootChange) -- triggers any tests which may throw
   * 5. _changeUp(value) -- update changed fields to branches,
   *       recursively changeUp for any subProps
   * 6. _changeDown()
   *        i. _changeFromBranch(this);
   *        ii. inject this updated value into its parent
   *        iii. parent.next(updated, CHANGE_DOWN) updates the value all the way to the root.
   *
   * If there are any errors all changes after the beginning of next() are rolled back.
   *
   * otherwise, at the close of any outermost transactions where changes were made:
   *
   * 7. advance the version of dirty values
   * 8. journal the changes
   * 9. broadcast to any subscribers
   */

  get isRoot() {
    return !this.parent;
  }

  private _do: any;

  get do(): any {
    if (!this._do) {
      this._do = {};
    }
    return this._do;
  }

  public _isStopped = false;

  get isStopped() {
    return this._isStopped;
  }

  config(opts: any = {}) {
    const {
      parent = null,
      branches = null,
      test,
      name,
      actions,
      type,
      any,
      selectors,
    } = opts;
    this._parent = parent;

    this.name = name;
    if (!this.name && !this.parent) {
      this.name = '[ROOT]';
    }

    if (branches) this.addBranches(branches);
    if (any) {
      this.type = TYPE_ANY;
    } else if (type) {
      this.type = type === true ? detectType(this.value) : type;
      this.emit('debug', {
        n: 2,
        message: ['type is ', type, 'this.type set to ', this.type],
      });
      this.addTest(testForType);
    }
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

    if (isThere(selectors)) {
      toMap(selectors).forEach((fn, name) => {
        this.addSelector(name, fn);
      });
    }
  }

  addSelector(name, selector) {
    this.selectors.set(name, { selector, value: ABSENT, valid: false });
    this._computeSelector(name);
  }

  _computeSelector(name) {
    if (this._selectors && this.selectors.has(name)) {
      // @ts-ignore
      const { selector } = this.selectors.get(name);
      let valid = false;
      let value: any = ABSENT;

      try {
        value = isFn(selector)
          ? selector(this.value, this)
          : this.do[selector]();
        valid = true;
      } catch (err) {
        value = err;
      }

      this.selectors.set(name, { selector, value, valid });
    }
  }

  emit(message, value) {
    this.e.emit(message, value);
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

  _flushJournal() {
    this._version = 0;
    this._highestVersion = 0;
    if (this._history) {
      this.history.clear();
    }
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

  _branch(value, name) {
    return new Leaf(value, { parent: this, name });
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
      const branch = value instanceof Leaf ? value : this._branch(value, name);
      branch.config({ name, parent: this });
      this.branches.set(name, branch);
      branch._changeDown();
    }
    return this.branches.get(name);
  }

  /**
   * this is the max version number present in this leaf, now.
   */
  _maxVersion() {
    let version = this.version === null ? 0 : this.version;
    if (this._branches) {
      this.branches.forEach(branch => {
        version = Math.max(version, branch._maxVersion());
      });
    }

    return version;
  }

  addTest(test: (any) => any) {
    this.on('change', (change: Change) => {
      try {
        const error = test(change);
        if (error) {
          change.error = error;
        }
      } catch (err) {
        if (!change.isStopped) {
          change.error = err;
        }
      }
    });
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

    const out: any = {
      name: this.name,
      value: this.value,
      version: this.version,
      history: this.historyString,
    };
    if (this.type) {
      out.type = this.type.toString();
    }
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
        if (hasKey(value, name, this.form)) {
          const newValue = getKey(value, name, this.form);
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
  _checkForm(value) {
    if (this.type === TYPE_ANY || this.form === TYPE_ANY) return;
    const valueType = detectForm(value);
    if (valueType !== this.form) {
      throw e(`incorrect form for leaf ${this.name || ''}`, {
        valueType,
        branchType: this.form,
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
      branch.next(newValue); // can throw;
    });
  }

  _changeFromBranch(branch) {
    if (branch.name && this.branch(branch.name) === branch) {
      const value = clone(this.value);
      setKey(value, branch.name, branch.value, this.form);
      this.emit('debug', {
        n: 2,
        message: ['--- >>>>>>>>> changing from branch ', branch.name],
      });
      this.next(value, CHANGE_DOWN);
    }
  }

  _changeDown() {
    if (this.parent) {
      this.parent._changeFromBranch(this);
    }
  }

  _makeChange(value, direction) {
    let updatedValue = value;

    if (
      direction !== CHANGE_ABSOLUTE &&
      this._initialized &&
      isCompound(this.form)
    ) {
      try {
        updatedValue = makeValue(this.value, value);
      } catch (err) {
        updatedValue = value;
      }
    }
    this.emit('debug', [
      'Leaf --- >>> setting value from ',
      this.value,
      ' to ',
      updatedValue,
      'from ',
      value,
    ]);
    return new Change(value, this, updatedValue);
  }

  _changeValue(value, direction: symboly = ABSENT) {
    this.transact(() => {
      const rootChange = this._makeChange(value, direction);
      if (direction === CHANGE_ABSOLUTE) {
        direction = ABSENT;
      }
      if (
        !(
          this.version !== null &&
          this._history &&
          this.history.get(this.version) === this.value
        )
      ) {
        this.snapshot();
      }

      this.value = rootChange.next;
      this.version = null;
      try {
        rootChange.target.emit('change', rootChange);
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
  next(value: any, direction: symboly = ABSENT) {
    if (this.isStopped) {
      throw e('cannot next() a stopped Leaf', {
        value,
        target: this,
      });
    }

    this.e.emit('next:setting ', this.name, 'to', value, direction);

    if (this.root._initialized && !this.type) {
      // if type is present, skip checkForm - there is a test for type in tests
      this._checkForm(value);
    }

    this._changeValue(value, direction);
  }

  /**
   * snapshots all "dirty" branches with the passed-in version and updates the
   * version of the branch.
   * @param version
   * @return {Leaf[]} an array of dirty leaves;
   */
  advance(version): Leaf[] {
    let dirtyLeaves: Leaf[] = [];

    // at this point the version is the next highest and at parent OR forward
    if (this._dirty) {
      this.version = version;
      this._dirty = false;
      this.snapshot(version);
      dirtyLeaves.push(this);
    }
    this.branches.forEach(branch => {
      const dirtyBranches = branch.advance(version);
      if (dirtyBranches.length) {
        dirtyLeaves = [...dirtyLeaves, ...dirtyBranches];
      }
    });

    return dirtyLeaves;
  }

  /**
   * token is an arbitrary object that is referentially unique. An object, Symbol. Not a scalar (string/number).
   * The significant trait of token is that when you popTrans (remove it from the trans collection,
   * it (AND ONLY IT) are removed.
   *
   * @param token
   */
  pushTrans(token: any) {
    this.emit('debug', {
      n: 2,
      message: ['PushTrans: ', token, 'into', this.transList],
    });
    this.transList = [...this.transList, token];
    return token;
  }

  /**
   * remove a trans from the root collection
   * @param token
   */
  popTrans(token: any) {
    this.emit('debug', {
      n: 2,
      message: ['popTrans: ', token, 'from', this.transList],
    });
    this.transList = this.transList.filter(t => t !== token);
    return token;
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
   * all actions, and next() changes, are transact() wrapped, so only one difference
   * is broadcast for every outermost transaction.
   * @param fn
   */
  transact(fn) {
    if (this._isStopped) {
      throw e('cannot perform transaction after a leaf is stopped', { fn });
    }

    if (!this.inTransaction) {
      this.emit('debug', { j: true, message: '(((( starting transaction' });
    }
    const startMax = this.maxVersion;
    const startHighest = this.highestVersion;
    const token = this.pushTrans(
      Symbol(
        `leaf ${this.name}, version ${startMax}, ${Math.round(
          Math.random() * 10000
        )}`
      )
    );
    let out;
    try {
      out = fn();
      this.popTrans(token);
    } catch (err) {
      this.popTrans(token);
      this.emit('debug', ['---- error in transaction: ', err]);
      if (startMax !== null) this.rollbackTo(startMax);
      throw e(err, { leaf: this });
    }
    if (!this.inTransaction) {
      this.emit('debug', [
        `----------!!------------ done with set value:`,
        this.value,
        `of ${this.name}not in trans - advancing`,
      ]);

      const dirtyLeaves = this.root.advance(this.highestVersion + 1);
      if (
        dirtyLeaves.length ||
        this.maxVersion !== startMax ||
        this.highestVersion !== startHighest
      ) {
        dirtyLeaves.forEach(leaf => leaf.broadcast());
      }
    } else {
      this.emit('debug', {
        n: 2,
        message: ['----------!!-------------- transaction still active', this.root.transList],
      });
    }
    this.emit('debug', ['end of transaction', token]);
    return out;
  }

  subscribe(listener: any) {
    if (this.isStopped) {
      throw e('cannot subscribe to stopped Leaf', { target: this });
    }

    return this.subject.subscribe(listener);
  }

  broadcast() {
    this.e.emit('updated', this);
  }

  /* -------------------- delKeys -------------------- */

  snapshot(version = 0) {
    this.history.set(version, this.value);
  }

  /**
   * returns the latest snapshot tuple whose version <= version.
   * @param version
   * @returns {{version: number, value: any} | null}
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
    if (this.version !== null && this.version <= version) {
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
          this.history.delete(kVersion);
        }
      });
    }
  }

  /* ------------------- Actions --------------------- */

  /**
   * resets all branches by resetting their value to the first one
   * whose version is <= the target.
   *
   * @param version {number}
   * @param rollingForward {boolean}
   */
  rollbackTo(version: number, rollingForward = false) {
    if (!rollingForward) {
      this.root.rollbackTo(version, true);
      return;
    }

    // either  at parent, or rolling forward from parent

    if (this._dirty || this.version === null || this.version > version) {
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
    this.on('updated', (target: Leaf) => {
      if (!target.inTransaction) {
        this.subject.next(this.value);
        this.emit('debug', 'broadcasting');
      } else {
        this.emit('debug', { n: 2, message: 'skipping updated' });
      }
    });
  }

  _delKeys(keys) {
    return delKeys(clone(this.value), keys);
  }

  delKeys(...keys) {
    if (isArr(keys[0])) {
      return this.delKeys(...keys[0]);
    }
    if (!keys.length) return;

    keys.forEach(key => {
      if (this._branches && this.branches.has(key)) {
        this.branches.get(key).complete();
        this.branches.delete(key);
      }

      try {
        const actionName = `set${ucFirst(key)}`;
        if (actionName in this._inferredActions) {
          delete this._inferredActions[actionName];
        }
      } catch (err) {
        this.emit('debug', [`cannot delete action for key ${key}`, err]);
      }
    });

    this._makeDo();

    const value = this._delKeys(keys);
    this.next(value, CHANGE_ABSOLUTE);
  }

  complete() {
    if (this._branches) {
      this.branches.forEach(branch => {
        branch.complete();
      });
    }
    this.branches.clear();
    if (this._subject) this._subject.complete();
    this._isStopped = true;
  }

  inferActions() {
    const valKeys = keys(this.value);
    this._inferredActions = {};
    valKeys.forEach(key => {
      this.addAction(
        `set${ucFirst(key)}`,
        (leaf, value) => {
          return leaf.set(key, value);
        },
        true,
        true
      );
    });

    if (this._branches) {
      this.branches.forEach((_branch, key) => {
        if (!valKeys.includes(key)) {
          this.addAction(
            `set${ucFirst(key)}`,
            (leaf, value) => {
              return leaf.set(key, value);
            },
            true,
            true
          );
        }
      });
    }
    this._makeDo();
  }

  addAction(name: string, fn, inferred = false, noBlend = false): boolean {
    try {
      if (inferred) {
        if (!this._inferredActions) {
          this._inferredActions = {};
        }
        this._inferredActions[name] = (...args) =>
          this.transact(() => fn(this, ...args));
      } else {
        if (!this._userActions) {
          this._userActions = {};
        }
        this._userActions[name] = (...args) =>
          this.transact(() => fn(this, ...args));
      }
      return true;
    } catch (err) {
      console.warn('cannot addAction', name, fn);
      // @ts-ignore
      console.warn(err.message);
      return false;
    }
    if (!noBlend) this._makeDo();
  }

  set(name, value: any) {
    if (this._isStopped) {
      throw e('cannot set after a branch is stopped', { name, value });
    }
    if (this._branches && this._branches.has(name)) {
      this.branch(name).next(value);
    } else {
      switch (this.form) {
        case FORM_OBJECT:
          this.next({ [name]: value });
          break;

        case FORM_MAP:
          this.next(new Map([[name, value]]));
          break;

        case FORM_ARRAY:
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
          console.warn('set attempted on subject of type', this.form);
      }
    }
    return value;
  }

  pipe(...args) {
    // @ts-ignore
    return this.subject.pipe(...args);
  }

  select(...fields) {
    const fieldNames = flattenDeep(fields);
    return this.pipe(
      map(value => {
        const out = new Map();
        const type = detectForm(value);
        fieldNames.forEach(name => {
          out.set(name, getKey(value, name, type));
        });
        return out;
      }),
      distinctUntilChanged()
    );
  }

  protected on(event: string, listener: (arg0: any) => void) {
    this.e.on(event, value => {
      if (value instanceof Change && value.target.isStopped) {
        // don't listen
      } else if (value instanceof Leaf && value.isStopped) {
        // don't listen
      } else {
        listener(value);
      }
    });
  }

  private _makeDo() {
    this._do = {};
    [this._inferredActions, this._userActions].forEach(actionSet => {
      if (isObj(actionSet)) {
        Object.assign(this._do, actionSet);
      }
    });
  }
}
