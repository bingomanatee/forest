import { Change } from '../Change';
import {
  ABSENT,
  CHANGE_ABSOLUTE,
  CHANGE_DOWN,
  CHANGE_UP,
  TYPE_ANY,
} from '../constants';
import { LeafType } from '../types';
import {
  clone,
  detectForm,
  detectType,
  e,
  getKey,
  hasKey,
  isArr,
  setKey,
} from '../utils';

function childChanges(target, value): Map<LeafType, any> {
  const childChanges = new Map();

  target.eachChild((child, name) => {
    //@TODO: type test now?
    if (hasKey(value, name, target.form)) {
      const newValue = getKey(value, name, target.form);
      if (newValue !== child.baseValue) {
        childChanges.set(child, newValue);
      }
    }
  });

  return childChanges;
}

function checkForm(target, value) {
  /**
   * insures that the value is the same type as the leaf's current value
   * @param value
   */
  if (target.type === TYPE_ANY || target.form === TYPE_ANY) return;

  if (target.type) {
    const valueType = detectType(value);

    if (target.type === true) {
      // a specific boolean - not just truthy
      const targetType = detectType(target.baseValue);
      if (valueType === targetType) return;
      throw e(
        `incorrect type for leaf ${target.name ||
          ''}; wanted ${targetType.toString()}, got ${targetType.toString()}`,
        { valueType, targetType, target, value }
      );
    }

    if (isArr(target.type)) {
      if (target.type.includes(valueType)) return;
      throw e(`incorrect type for leaf ${target.name || ''}; `, {
        valueType,
        target,
        types: target.type,
        value,
      });
    }

    if (valueType !== target.type) {
      throw e(`incorrect type for leaf ${target.name || ''}`, {
        valueType,
        type: target.type,
        target,
        value,
      });
    }
  }

  const valueForm = detectForm(value);
  if (valueForm !== target.form) {
    throw e(
      `incorrect form for leaf ${target.name ||
        ''}; wanted ${target.form.toString()}, got ${valueForm.toString()}`,
      {
        valueForm,
        leafForm: target.form,
        value,
      }
    );
  }
}
export default function listenForChange(target) {
  target.on('change-up', value => {
    const branchMap = childChanges(target, value);
    branchMap.forEach((newValue, child) => {
      child.next(newValue); // can throw;
    });
  });

  target.on('change-from-child', (child: LeafType) => {
    if (child.name && target.child(child.name) === child) {
      const value = clone(target.baseValue);
      const branchValue = child.valueWithSelectors();
      setKey(value, child.name, branchValue, target.form);
      target.emit('debug', {
        n: 2,
        message: ['--- >>>>>>>>> changing from child ', child.name],
      });
      target.next(value, CHANGE_DOWN);
    }
  });

  target.on('change-value', ({ value, direction }) => {
    if (target.isInitialized) {
      checkForm(target, value);
    }
    target.transact(() => {
      const rootChange = Change.create(target, value, direction);
      if (direction === CHANGE_ABSOLUTE) {
        direction = ABSENT;
      }
      if (
        !(
          target.version !== null &&
          target._history &&
          target.history.get(target.version) === target.baseValue
        )
      ) {
        target.snapshot();
      }

      target.baseValue = rootChange.next;
      target.version = null;
      try {
        target.emit('change', rootChange);
        if (rootChange.error) throw rootChange.error;
        if (direction !== CHANGE_DOWN) {
          target.emit('change-up', value);
        }
        if (direction !== CHANGE_UP && !target.isRoot) {
          target.parent.emit('change-from-child', target);
        }
      } catch (err) {
        if (!rootChange.isStopped) {
          rootChange.error = err;
        }
        throw err;
      }
      rootChange.complete();
    });
  });

  target.on('rollback', version => {
    /**
     * resets all children by resetting their value to the first one
     * whose version is <= the target.
     *
     * @param version {number}
     * @param rollingForward {boolean}
     */

    // either  at parent, or rolling forward from parent

    if (target._dirty || target.version === null || target.version > version) {
      // at target point we do have a value that needs to be redacted

      const snap = target._getSnap(version);

      if (snap !== null) {
        target._value = snap.value;
        target._version = snap.version;
      }
      target._purgeHistoryAfter(version);
    }

    target._childEmit('rollback', version);
  });
}
