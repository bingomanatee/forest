let Mirror = null;

export const setInstance = inst => {
  Mirror = inst;
};

export const isMirror = target => Mirror && target instanceof Mirror;
export const create = (...args) =>
  // @ts-ignore
  Mirror !== null ? new Mirror(...args) : null;
