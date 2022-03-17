export type symboly = symbol | string | undefined;

export type LeafType = {
  value: any;
  form?: symboly;
  bugLog: (...any) => void;
};
