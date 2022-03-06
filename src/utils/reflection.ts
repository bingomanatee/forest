let Leaf: any = null;

export const setInstance = inst => {
  Leaf = inst;
};

export const isMirror = (target): boolean =>
  !!(Leaf && target instanceof Leaf);
export const create = (...args) =>
  // @ts-ignore
  Leaf !== null ? new Leaf(...args) : null;
