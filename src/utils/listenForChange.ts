import { Change } from "../Change";
import {ABSENT, CHANGE_ABSOLUTE, CHANGE_DOWN, CHANGE_UP } from "../constants";
import {clone, setKey } from "../utils";


export default function listenForChange(target) {

  target.on('change-up', (value) =>{
      const branchMap = target._getBranchChanges(value);
      branchMap.forEach((newValue, branch) => {
        branch.next(newValue); // can throw;
      });
    });

  target.on('change-from-branch', (branch) => {
      if (branch.name && target.branch(branch.name) === branch) {
        const value = clone(target.value);
        setKey(value, branch.name, branch.value, target.form);
        target.emit('debug', {
          n: 2,
          message: ['--- >>>>>>>>> changing from branch ', branch.name],
        });
        target.next(value, CHANGE_DOWN);
      }
    })

  target.on('change-value', ({value, direction}) => {
    if (target.root._initialized && !target.type) {
      // if type is present, skip checkForm - there is a test for type in tests
      target._checkForm(value);
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
          target.history.get(target.version) === target.value
        )
      ) {
        target.snapshot();
      }

      target.value = rootChange.next;
      target.version = null;
      try {
        target.emit('change', rootChange);
        if (rootChange.error) throw rootChange.error;
        if (direction !== CHANGE_DOWN) {
          target.emit('change-up', value);
        }
        if (direction !== CHANGE_UP && !target.isRoot) {
          target.parent.emit('change-from-branch', target);
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
  
  target.on('rollback', (version) => {
    /**
     * resets all branches by resetting their value to the first one
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

      target.branchEmit('rollback', version);
  })
}
