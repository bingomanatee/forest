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
  isArr,
  isThere,
  toMap,
} from './utils';
import {
  ABSENT,
  CHANGE_ABSOLUTE,
  FORM_ARRAY,
  FORM_MAP,
  FORM_OBJECT,
  TYPE_ANY,
} from './constants';
import { doType, LeafType, symboly } from './types';
import WithDebug from './Leaf/WithDebug';
import WithActions from './Leaf/WithActions';
import WithSelectors from './Leaf/WithSelectors';
import listenForChange from './Leaf/listenForChange';

// @ts-ignore
@WithActions
// @ts-ignore
@WithSelectors
// @ts-ignore
@WithDebug
export default class Leaf {
  public _dirty = false;
  public _useSetters: boolean | string | null = null;
  debug: any;
  name: any;
  type?: symboly | boolean;

  /**
   *  -------------- constructor ----------
   *  */

  constructor(value: any, opts: any = {}) {
    this.debug = !!opts.debug;
    listenForChange(this);
    this.baseValue = value;
    this._transList = [];
    this.config(opts);

    this.version = 0;
    this.snapshot(0);
    this._flushJournal();

    this._isInitialized = true;
  }

  /**
   *  ------------------- events ----------------------
   *  */
  //region events
  protected _e: EventEmitter<any> = new EventEmitter();

  //@TODO: ise EventEmitter.Protected
  get e() {
    return this._e;
  }

  public on(event: string, listener: Function) {
    const target = this;
    return this.e.on(event, value => {
      if (!target.isStopped) {
        listener(value);
      }
    });
  }

  emit(message, value: any = null) {
    this.e.emit(message, value);
  }
  //endregion
  /**
   *  ------------------- parent/child, children ------------------
   *  */
  // region parentChild
  private _children: Map<any, any> | undefined;

  get children(): Map<any, any> {
    if (!this._children) this._children = new Map();
    return this._children;
  }

  get root(): LeafType {
    if (this.parent) return this.parent.root;
    return this;
  }

  beach(fn) {
    this.eachChild(fn);
  }

  eachChild(fn) {
    if (!this._children) {
      return;
    }
    this.children.forEach(fn);
  }

  addBranches(children) {
    return this.addChildren(children);
  }

  addChildren(children) {
    if (this.isStopped) {
      throw e('cannot add children to stopped leaf', { leaf: this, children });
    }
    if (Array.isArray(children)) {
      // transport value properties to sub-children
      children.forEach(name => {
        this.child(name, getKey(this._value, name));
      });
    } else {
      toMap(children).forEach((child, name) => {
        this.child(name, child);
      });
    }
  }

  /**
   * if no value, returns child "name";
   * if value is a child, injects it as a child at name;
   * otherwise it creates a new child with value value at name;
   *
   * if there is a '.' in the name, it recursively creates object nodes to create a nested child.
   * @param name
   * @param value
   */
  child(name: any, value: any = ABSENT) {
    if (Array.isArray(name)) {
      // crawl a series of children

      // @typescript-eslint/no-this-alias
      let lastChild = this;
      name.forEach((nameItem, index) => {
        if (index === name.length - 1) {
          lastChild = lastChild.child(nameItem, value);
        } else {
          const addChild = lastChild.child(nameItem);
          if (!addChild) {
            throw new Error(
              `cannot resolve path ${name.join(
                '.'
              )} broke at ${nameItem}:${index}`
            );
          } else {
            lastChild = addChild;
          }
        }
      });
      return lastChild;
    }

    if (typeof name === 'string' && name.indexOf('.') > 0) {
      // recurse the method by splitting child names using '.'
      return this.child(name.split(/\./g), value);
    }

    if (isThere(value)) {
      // "set" mode - create/add a child

      // creating a new child - either injecting a leaf-type child or creating one with that value.
      const child =
        value instanceof Leaf ? value : new Leaf(value, { parent: this, name });
      child.config({ name, parent: this });
      this.children.set(name, child);
      this.emit('change-from-child', child);
    }

    // "get" mode -- return the child from the local map
    if (!this._children) {
      // children lazy-creates a map once a child is added
      return undefined;
    }
    return this.children.get(name);
  }

  branch(name: any, value: any = ABSENT) {
    return this.child(name, value);
  }

  _childEmit(message, value) {
    this.eachChild(child => {
      child.emit(message, value);
    });
  }
  // endregion
  /**
   *  ------------------ version tracking ------------------------
   */

  // region version
  /*
      the highest version that has ever been used;
      should be true for the entire tree,
      as changes to any child version cascade to the parent,
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
    if (this.isRoot) {
      return this._maxVersion();
    }
    return this.root.maxVersion;
  }

  private _version: number | null = 0;

  get version(): number | null {
    return this._version;
  }

  set version(value: number | null) {
    if (!this.root.isInitialized) {
      this._version = 0;
      return;
    }
    this._version = value;
    if (value !== null && value > this.root.highestVersion) {
      this.root.highestVersion = value;
    }
  }

  // endregion
  /**
   * ------------------------ value, history -------------------------------
   */

  //region value
  public _value: any = ABSENT;

  get baseValue(): any {
    return this._value;
  }

  /**
   * updates the value of this form. There may be a brief inconsistency as
   * the values of the update are sent out to the children which can reinterpret them.
   * @param value
   */
  set baseValue(value: any) {
    if (this._value === value) return;
    this._value = value;
    if (this.isInitialized) {
      this._dirty = true;
    } else {
      this._subject.next(value);
    }
  }

  get value() {
    // overridden in WithSelectors
    return this.baseValue;
  }

  set value(nextValue) {
    this.baseValue = nextValue;
  }

  get historyString() {
    let out = '';
    this.history.forEach((value, key) => {
      out += `${key} -> ${JSON.stringify(value)}, `;
    });

    return out;
  }

  private _history?: Map<number, any>;

  /*
    value is the current version of this leaf.
    A leaf can have children with lower version numbers than it,
    but a leaf should never have children with higher versions than it.
    note - version is set to null for transient values inside a transact();
     the outermost transact  will advance all dirty data to the next version,
     and rollback will purge it back to a known prior one.
  */

  get history() {
    if (!this._history) this._history = new Map();
    return this._history;
  }

  private _transSubject: SubjectLike<Set<any>> | null = null;

  /**
   * a broadcaster of the current state;
   * @TODO: replace subject with a filtered, mapped version of transSubject
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

  protected _transList: any[];

  get transList() {
    if (this.isRoot) {
      return this._transList;
    }
    return this.root.transList;
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

  //endregion

  /**
   * ----------------------- selectors ---------------------------
   * incomplete; overridden by WithSelectors
   */

  // region selectors
  /**
   * this is a "stub" that is decorated by WithSelector
   * @param _value
   */
  valueWithSelectors(_value?: any) {
    return _value;
  }

  get $() {
    return {};
  }

  get $$() {
    return new Map();
  }

  //endregion
  /**
   * -------------------- transactions -------------------
   * */
  // region transactions

  /*
      transactions are global and managed from the root of the tree.
      They are stored in an array and tracked in a BehaviorSubject
      that stores a set from that array.

      The nature of what token is stored in the array is not really important
      as long as its referentially unique; as such, symbols make good
      transaction tokens.
       */

  /**
   * ---------------------------- inspection, identity, metadata, misc.
   */

  // region inspection

  public _parent: any;

  get parent(): any {
    return this._parent;
  }

  get isRoot() {
    return !this.parent;
  }

  _isInitialized = false;

  get isInitialized() {
    return this._isInitialized;
  }

  /**
   * the general structure (array, map, scale)
   * less specific than type.
   */
  get form() {
    return detectForm(this.baseValue);
  }

  get do(): doType {
    return {};
  }

  public _isStopped = false;

  // endregion

  /**
   * ---------------------------- next ----------------------------
   * `next` submits a new value. In this order:
   * note: every time you update value its leaf is marked as 'dirty"
   * to flag it as having been changed for step 4.
   *
   */

  // region next

  /**
   * ---------------------------- misc -----------------------------
   */

  // region misc
  get isStopped() {
    return this._isStopped;
  }

  /**
   * this is the max version number present in this leaf, now.
   */
  _maxVersion() {
    let version = this.version === null ? 0 : this.version;
    this.eachChild(child => {
      version = Math.max(version, child._maxVersion());
    });

    return version;
  }

  _flushJournal() {
    this._version = 0;
    this._highestVersion = 0;
    if (this._history) {
      this.history.clear();
    }
    this._dirty = false;
    this.snapshot(0);
    this.eachChild(b => b._flushJournal());
  }

  broadcast() {
    this.emit('debug', ['broadcasting ', this.baseValue]);
    if (!this.inTransaction && !this.isStopped) {
      this._subject.next(this.baseValue);
    }
  }
  // endregion

  /**
   * ----------------- configuration ----------------------
   *
   * note - each parent of Leaf (from decorators) will override and delegate this method
   * to read its needed input. Technically - this method can be called more than once from the outside,
   * but that hasn't been thoroughly tested, and its a good idea to simply call the
   * methods like "addActions" or "addSelector(s)" to update your Leaf.
   */

  //region config

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

  config(opts: any = {}) {
    const {
      setters = null,
      parent = null,
      children = null,
      branches = null, // backwards compatibility from earlier version
      test,
      name,
      type,
      any,
      res,
    } = opts;
    this._parent = parent;
    this._useSetters = setters; // should be in actions, but order of operations has issues

    this.name = name;
    if (!this.name && !this.parent) {
      this.name = '[ROOT]';
    }

    if (children) this.addChildren(children);
    if (branches) this.addChildren(branches);
    if (any) {
      this.type = TYPE_ANY;
    } else if (type) {
      this.type = type === true ? detectType(this.baseValue) : type;
    }
    if (typeof test === 'function') this.addTest(test);

    if (res) {
      toMap(res).forEach((res, name) => {
        this.res(name, res);
      });
    }
  }

  /**
   * snapshots all "dirty" children with the passed-in version and updates the
   * version of the child.
   * @param version
   * @return {Leaf[]} an array of dirty leaves;
   */
  setVersionOfDirtyLeaves(version: number): LeafType[] {
    let dirtyLeaves: LeafType[] = [];

    // at this point the version is the next highest and at parent OR forward
    if (this._dirty) {
      this.version = version;
      this._dirty = false;
      this.snapshot(version);
      dirtyLeaves.push(this);
    }

    this.eachChild(child => {
      const dirtyChiuldren = child.setVersionOfDirtyLeaves(version);
      if (dirtyChiuldren.length) {
        dirtyLeaves = [...dirtyLeaves, ...dirtyChiuldren];
      }
    });

    return dirtyLeaves;
  }

  // endregion

  /** --------------------- resources (res) --------------------
   * resources are any sort of configuration, utilities or other tools
   * that are more or less static; used to augment actions or other functionality
   */

  // region res
  private _res;
  res(name, value = ABSENT) {
    if (isThere(value)) {
      // set mode
      if (!this._res) {
        this._res = new Map();
      }
      this._res.set(name, value);
    } else {
      // get mode
      if (this._res) {
        return this._res.get(name);
      }
      return undefined;
    }
  }

  // endregion

  // region transactions
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
      if (startMax !== null) this.root.emit('rollback', startMax);
      throw e(err, { leaf: this });
    }
    if (!this.inTransaction) {
      this.emit('debug', [
        `----------!!------------ done with set value:`,
        this.baseValue,
        `of ${this.name}not in trans - advancing`,
      ]);

      const dirtyLeaves = this.root.setVersionOfDirtyLeaves(
        this.highestVersion + 1
      );
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
        message: [
          '----------!!-------------- transaction still active',
          this.root.transList,
        ],
      });
    }
    this.emit('debug', ['end of transaction', token]);
    return out;
  }

  // endregion

  /**
   * ------------------------ input / output ----------------------------
   */

  // region io
  /**
   * get a map of change objects for each property in value
   * that has been changed by the value from the current value of that child.
   *
   * If there are no children, or none of the child fields have been changed,
   * this method will return an empty Map.
   * @param value
   */

  protected _subject = new BehaviorSubject(null);

  get subject(): SubjectLike<any> {
    return this._subject;
  }

  /**
   * updates the value of this child.
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

    this.e.emit('debug', ['next:setting ', this.name, 'to', value, direction]);

    this.emit('change-value', { value, direction });
  }

  subscribe(listener: any) {
    if (this.isStopped) {
      throw e('cannot subscribe to stopped Leaf', { target: this });
    }

    return this.subject.subscribe(listener);
  }

  pipe(...args) {
    // @ts-ignore
    return this.subject.pipe(...args);
  }

  /**
   * subscribe to a subset of this leaf; only gets notified if
   * those fields actionslly changed.
   * @param fields
   */
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

  set(name, value: any) {
    if (this._isStopped) {
      throw e('cannot set after a Leaf is stopped', { name, value });
    }
    if (this._children && this._children.has(name)) {
      this.child(name).next(value);
    } else {
      switch (this.form) {
        case FORM_OBJECT:
          this.next({ [name]: value });
          break;

        case FORM_MAP:
          this.next(new Map([[name, value]]));
          break;

        case FORM_ARRAY:
          const next = [...this.baseValue];
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

  get(name): any {
    return getKey(this.baseValue, name, this.form);
  }

  // endregion
  /**
   *  -------------------- delKeys --------------------
   *  */
  // region delkeys

  _delKeys(keys) {
    return delKeys(clone(this.baseValue), keys);
  }

  delKeys(...keys) {
    if (isArr(keys[0])) {
      return this.delKeys(...keys[0]);
    }
    if (!keys.length) return;

    keys.forEach(key => {
      if (this._children && this.children.has(key)) {
        this.children.get(key).complete();
        this.children.delete(key);
      }

      try {
        this.emit('action-remove-setter', { name: key, noBlend: true });
      } catch (err) {
        this.emit('debug', [`cannot delete action for key ${key}`, err]);
      }
    });

    this.emit('actions');

    const value = this._delKeys(keys);
    this.next(value, CHANGE_ABSOLUTE);
  }

  // endregion
  /**
   * ----------------------- snapshot, rollback -----------------
   */

  // region snapshot

  snapshot(version = 0) {
    this.history.set(version, this.baseValue);
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
        value: this.baseValue,
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

  toJSON(network = false) {
    if (network && this.children.size) {
      const out = this.toJSON();
      if (this._children) {
        out.children = [];
        this.eachChild(b => {
          out.children.push(b.toJSON(true));
        });
      }
      return out;
    }

    const out: any = {
      name: this.name,
      value: this.baseValue,
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
    if (this.debug) out.debug = this.debug;
    return out;
  }

  complete() {
    if (this._children) {
      this.eachChild(child => {
        child.complete();
      });
      this.children.clear();
    }

    if (this._subject) this._subject.complete();
    this._isStopped = true;
  }

  // endregion
}
