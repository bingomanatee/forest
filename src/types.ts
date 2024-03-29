import { transactionSet, transObj } from '@wonderlandlabs/transact/dist/types';
import { collectObj, generalObj } from '@wonderlandlabs/collect/lib/types';
import { MonoTypeOperatorFunction, Observable, Observer, Subscription } from 'rxjs';
import { LeafManager } from './LeafManager';

// -------------- general things

export type pojo = { [key: string | symbol]: any };
export type genFn = (...args: any[]) => any;
// ------------- Leaf related type

export type keyName = string | number;
export type leafName = string | number;
export type leafVariants = '' | 'collection';
export type leafCollectionType = 'array' | 'map' | 'object';

export interface valuable {
  value: any;
  fast?: boolean;
}

export type forestConfig = {
  trans?: transactionSet;
  leafMgr: LeafManager;
};

export type mutatorFn = (store: collectObj) => collectObj;

export type leafIBase = {
  id: string;
  name?: leafName;
  variant?: leafVariants;
  collectionType?: leafCollectionType;
  readonly isDebug: boolean;
  terminated?: boolean;

  valueOf(): unknown;

  $isLeaf: symbol;
  getLeaf(id: string): leafIBase | undefined;

  store: collectObj;
  originalStore?: collectObj;

  filter?: valueFilterFn;
  test?(value: any): any;
  validate(): void;
  trans: transactionSet;

  freeze(token: symbol): void;
  unfreeze(token?: symbol): void;
  readonly isFrozen: boolean;

  childKeys?: collectObj; // key = value to replace in leaf, value == string (leafId)
  child(key: keyName): leafI | undefined;
  parent?: leafI;
  children: childDef[];
  parentId?: string;
  shareChildValues(): void;
  addChild(key: any, value: any): void;
  removeChild(key: any): void;

  toJSON(): generalObj;
  type: string;
  firstType: string;
  family: string;
  fast: boolean;

  addAction(name: string, action: leafDoFn): void;
  updateDoSetters(): void;
  fixedSetters: any[] | null;
  updateDo(updateSetters?: boolean): void;
  set(key: any, value: any): leafI;
  get(key: any): any;
  recompute(): void;
  getMeta(key: any): any;
  setMeta(key: any, value: any, force?: boolean): leafI;

  observable: Observable<any>;
  subscribe: (listener: any) => Subscription;
  select: (listener: any, selector: selectorFn) => Subscription;
} & valuable;
export type testFn = (value: any, leaf: leafI) => any;
export type leafFn = (...rest: any[]) => any;
export type leafDoFn = (leaf: leafI, ...rest: any[]) => any;
export type valueFilterFn = (value: any, leaf?: leafI) => any;

export type leafDoObj = { [name: string]: leafDoFn };
export type leafFnObj = { [name: string]: leafFn };

export type childDef = { child: leafI; key: any; leafId: string };
export type valueCache = { lastTransId: number; value: any };

export type leafI = leafIBase & {
  do: leafFnObj;
  $: leafFnObj;
};
// ----- typed

export type typedLeaf<ValueType> = leafI & { value: ValueType };
export type typedDoLeaf<ValueType, DoObj> = leafIBase & {
  value: ValueType;
  do: DoObj | leafFnObj;
  $: leafFnObj;
};
export type typedDoSelLeaf<ValueType, DoObj, SelObj> = leafIBase & {
  value: ValueType;
  do: DoObj | leafFnObj;
  $: SelObj;
};
export type typedSeLeaf<ValueType, SelObj> = leafIBase & { value: ValueType; $: SelObj };

// ------------- leaf config

type configChild = leafConfig | any;
export type leafConfig = {
  $value: any;
  selectors?: leafDoObj;
  id?: string;
  key?: any;
  variant?: leafVariants;
  parentId?: string;
  type?: string | string[] | boolean;
  test?: testFn | testFn[];
  name?: leafName;
  children?: { [key: string]: configChild } | Map<any, configChild>;
  actions?: leafDoObj;
  fixedSetters?: string[];
  filter?: valueFilterFn;
  original?: boolean;
  debug?: boolean;
  fast?: boolean;
  meta?: Map<any, any> | generalObj | collectObj;
};

// ------------- RxJS / observable type

export type listenerType = Partial<Observer<Set<transObj>>> | ((value: Set<transObj>) => void) | undefined;
export type selectorFn = (value: any) => any;
export type voidFn = () => void;
export type listenerFn = (next: any) => void;
export type mutators = MonoTypeOperatorFunction<any>[];
export type listenerObj = {
  next?: listenerFn;
  error?: listenerFn;
  complete?: voidFn;
};
