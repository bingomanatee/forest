/**
 *
 * @param target {object}
 * @param name {string}
 * @param creator {function}
 */
export default function lazy(target, name, creator) {
  const value = creator(target, name);

  Object.defineProperty(target, name, {
    value,
  });

  return value;
}
