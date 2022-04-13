import { isArr, Leaf } from '../src';
const _ = require('lodash');
const UNSET = Symbol('unset');

function makeField(
  name: string,
  initial,
  validator: any = null,
  optional = false
) {
  function validate(value) {
    if (!validator) return null;
    try {
      return validator(value);
    } catch (err) {
      return _.get(err, 'messgae', err);
    }
  }
  return new Leaf(
    {
      name,
      value: initial,
      touched: false,
    },
    {
      actions: {
        update: (leaf, event) => {
          leaf.do.setTouched(true);
          leaf.do.setValue(event.target.value);
        },
        reset(leaf, value = UNSET) {
          leaf.do.setTouched(false);
          leaf.do.setValue(value === UNSET ? initial : value);
        },
      },
      selectors: {
        isValid({ value, touched }) {
          return (optional || touched) && !validate(value);
        },
        errors({ value }) {
          return validate(value);
        },
      },
    }
  );
}

describe('Leaf', () => {
  describe('use cvases', () => {
    it('should be ale to update an array', () => {
      function validateTrigger() {
        return true;
        /*
        trigger => {
          if (!isObj(trigger)) {
            throw new Error('trigger must be an object');
          }
          if (!(trigger.query_value && isStr(trigger.query))) {
            throw new Error('trigger query must be a non-empty string');
          }
          if (!trigger.comp) {
            throw new Error('trigger must have a comp');
          }
          if (['TRUE', 'FALSE'].includes(trigger.comp)) {
            return false;
          }
          if (
            !['EQ', 'EQ', 'LT', 'GT', 'NE', 'REGEX', 'TRUE', 'FALSE'].includes(
              trigger.comp
            )
          ) {
            throw new Error(`trigger.comp invalid: ${trigger.comp}`);
          }
          if (!isThere(trigger.comp) || trigger.comp === '') {
            throw new Error(`trigger.comp ${trigger.comp}must not be empty`);
          }
        };*/
      }

      function procFormLeaf(addProc, cancel) {
        return new Leaf(
          {
            status: 'new',
            page: 0,
            error: null,
            triggers: [],
          },
          {
            selectors: {
              isValid({ name, order, description }) {
                return name.$isValid && order.$isValid && description.$isValid;
              },
            },
            actions: {
              addTrigger(leaf, trigger) {
                const triggerBranch = leaf.branch('triggers');
                const oldTriggerValue = triggerBranch.value;
                const update = [...oldTriggerValue.value, trigger];

                const newTriggewrValue = { ...oldTriggerValue, value: update };
                triggerBranch.next(newTriggewrValue);
              },
              cancel(leaf) {
                leaf.do.reset();
                cancel();
              },
              advance(leaf, inc = 1) {
                if (!(typeof inc === 'number')) inc = 1;
                leaf.do.setPage(leaf.value.page + inc);
              },
              reset(leaf) {
                leaf.branch('name').do.reset();
                leaf.branch('order').do.reset(0);
                leaf.branch('description').do.reset();
                leaf.do.setStatus('new');
              },
              savew() {
                addProc();
              },
            },

            branches: {
              name: makeField('name', '', value => {
                if (!value.length) return 'name must be present';
                return null;
              }),
              order: makeField(
                'order',
                0,
                value => {
                  if (typeof value === 'number') {
                    return null;
                  }
                  if (typeof value === 'string') {
                    if (!/^[\d]+$/.test(value)) {
                      return 'must be a number or numeric string';
                    }
                  }
                  return null;
                },
                true
              ),
              description: makeField('description', '', null, true),
              triggers: makeField('triggers', [], triggers => {
                if (!isArr(triggers)) return 'triggers must be an array';
                triggers.forEach(validateTrigger);
                return null;
              }),
            },
          }
        );
      }

      const leaf = procFormLeaf(_.identity, _.identity);

      const trigger = { name: 'foo', query: 'bar', condition: 'TRUE' };
      leaf.do.addTrigger(trigger);

      expect(leaf.value.triggers.value).toEqual([trigger]);
    });
  });
});
