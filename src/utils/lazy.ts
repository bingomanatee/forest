/**
 *
 * @param target {object}
 * @param name {string}
 * @param creator {function}
 */
import {isThere} from "./tests";

export default function lazy(target, name, creator) {
  const value = creator(target, name);

  Object.defineProperty(target, name, {
    value,
  });

  return value;
}

export const newMap = () => new Map();
export const newObj = () => ({});
export const newArray = () => [];
export function lazyProp(
  privateName: string,
  creatorFn: Function = newObj
): (target: any, key: string) => void {
  return (target: any, propertyKey: string) => {
    //make the method enumerable
    Object.defineProperty(target, propertyKey, {
      get: () => {
        if (!isThere(target[privateName])) {
          target[privateName] = creatorFn();
        }
        return target[privateName];
      },
      enumerable: true,
    });
  };
}
