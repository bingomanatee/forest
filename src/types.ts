export type symboly = symbol | string | undefined;

export type LeafType = {
  value: any;
  form?: symboly;
  debug: boolean;
  isStopped: boolean;
  toJSON: Function;
  isRoot: boolean;
  root: LeafType;
  parent: LeafType | null;
  next: (any, direction?: symboly) => void;
  initialized: boolean;
  emit: (name: string, value?: any) => void;
  on: (type: string, listener: Function) => void;
};

export type SelectorType = NonNullable<{
  selector: Function | string;
  value: any;
  valid: boolean;
}>;
