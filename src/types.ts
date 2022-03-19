export type symboly = symbol | string | undefined;

export type LeafType = {
  value: any;
  form?: symboly;
  debug: boolean;
  isStopped: boolean;
  toJSON: Function;
  root: LeafType;
  parent: LeafType | null;
};

export type SelectorType = NonNullable<{
  selector: Function | string;
  value: any;
  valid: boolean;
}>;
