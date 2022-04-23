export type symboly = symbol | string | undefined;
export type strNum = string | number;
export type doType = { [key: string]: Function };

export type LeafType = {
  value: any;
  baseValue: any;
  name: any;
  next: (any, direction?: symboly) => void;

  root: LeafType;
  parent: LeafType | null;
  isRoot: boolean;

  emit: (name: string, value?: any) => void;
  on: (type: string, listener: Function) => void;
  transList: any[];

  isStopped: boolean;
  isInitialized: boolean;
  version: number | null;
  maxVersion: number;
  highestVersion: number;

  setVersionOfDirtyLeaves: (version: number) => LeafType[];
  broadcast: () => void;

  set: (name, value: any) => void;
  get: (name) => any;
  do: doType;

  form?: symboly;
  debug: boolean;
  toJSON: Function;
  valueWithSelectors: (value?: any) => any;
  hasSelectors: boolean;
};

export type SelectorType = NonNullable<{
  selector: Function | string;
  value: any;
  args: strNum[];
}>;

export enum SnapshotStatus {
  past,
  current,
  pending,
  revoked,
}

export class LeafV2Interface {
  value: any;
  baseValue: any;
  version: number | undefined = 0;
  errors: any;
}

export type SnapshotType = {
  value: any;
  baseValue: any;
  version: number;
  status: SnapshotStatus;
  errors: any[];
  addError(err: any);
};

export type LeafV2ConfigType = {
  test?: (value: any, target?: LeafV2Interface) => any;
};
