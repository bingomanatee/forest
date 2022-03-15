# @wonderlandlabs/malt

Malt is a curated state system. Designed to fit the missing niche of a quick, maangeable state
system, it has an extensive commit cycle with validation, transactions and a streaming notifier.  

# Leaves

A leaf is a management system for a single element of data. 
Leafs can be centrally managed, or have branch managers delegated to manage properties in an object/Map leaf.

Branches are added to leaves in one of the following methods: 

Only Leaf instances whose value is an object, Map or array can have branches. Branches are not 
automatic - not all of an objects' or Map's properties are managed with branches.

To create a Branch on a leaf you must define the leaf in either

1. **configuration:** calling leaf with a branches property in the second argument:

```javascript

const point = new Leaf({
  w: 0,
  x: 0,
},
  {
    branches: {
      x: new Leaf(1),
      y: 2,
      z: 3
    }
  })

console.log('leaf value:', point.value);
// 'leaf value: ', {: 0, x: 1, y: 2: z: 3}

leaf.branch('y').next(4);

console.log('leaf value changed:', point.value);
// 'leaf value changed: ', {: 0, x: 1, y: 4: z: 3}

```

2. **dynamic:** you can call `myLeaf.branch(name, new Leaf(..))` to add a branch to
   the leaf. `myLeaf.branch(name, value)` will also work initializing a basic leaf.
   `myLeaf.branch(name)` or `myLeaf.branch(name, newBranchOrValue)` both return the branch itself. 

The value of sub-branches is you can localize validators or actions to affect sub-parts of the 
leaf. This is how you achieve the reducer pattern with Malt. 

Leaf can branch multiple times; as long as a branch is of type object/Map/array, it can have sub-branches applied to it.

## Actions

Leaf methods, or actions, allow you to achieve more complex change patterns. They are functions, and can return values. 
Leaf actions are accessed off a `.$do` object.

### Implicit (inferred) setters

Map and object types will have a set[field] function for every key/property in the initial value, and every branch.

```javascript

const point = new Leaf({x: 0, y: 0, z: 0});

point.$do.setX(3); 
// you don't have to configure actions - they auto-populate based on the properties in the initial value

console.log('point is now', point.value);
// 'point is now', {x: 3, y: 0, z: 0}

```

You can also define custom actions. These actions can act on the leaf (the implicit first value)
and/or return a value. No matter how many changes you execute inside an action, only one change will
be emitted to subscribers (see below).

As a general rule, you don't want to define custom actions using names like `set[...]()`. 
That pattern is used by autogenerated property actions and could get overwritten 
due to structural changes in the Leaf. 

```javascript

const point = new Leaf(
  { x: 0, y: 0, z: 0 },
  {
     actions: {
        addTo: (leaf, x, y, z) => {
           leaf.$do.setX(leaf.value.x + x);
           leaf.$do.setY(leaf.value.y + y);
           leaf.$do.setZ(leaf.value.z + z);
        },
        length(leaf) {
           return Math.sqrt(
                   leaf.value.x ** 2 + leaf.value.y ** 2 + leaf.value.z ** 2
           );
        },
     },
  }
);
leaf.subscribe({nexg(value) {console.log('leaf is noww', value)}})
// 'leaf is now', {x: 0, y: 0, z: 0}
leaf.$do.addTo(3, 6, 9);
// 'leaf is now', {x: 3, y: 6, z: 9}
leaf.$do.addTo(1, 1, 1);
// 'leaf is now', {x: 4, y: 7, z: 10}

console.log('length', leaf.$do.length());
// 'length', 12.84523257866513
```

In the above example, addTo triggers three other sub-changes with three "set" actions -- 
however because all actions (i.e., addTo) are transactionally contained, only one change is emitted. 
If you trigger a promise inside an action its advised that the response and error be 
captured in actions for maximum safety. 

Its also advised not to use async notation; if you do, 
NONE of the functions' body will be transactionally locked. 

```javascript

const user = new Leaf(
  {
    id: 0,
    name: '', 
    status: 'new',
    err: null
  },
  {
    actions: {
      save(leaf) {
        if (leaf.value.status !== 'new') return;
        leaf.$do.setStatus('saving');
        axios.put('/api/user/', ({
          name: this.name
        }))
                .then(leaf.$do.onSave)
                .catch(leaf.$do.onErr);
      },
      onSave(leaf, {data}) {
        leaf.$do.setId(data.id);
        leaf.$do.setStatus('saved');
      },
      onErr(leaf, err) {
        leaf.$do.setError(err.message);
        leaf.$do.setStatus('error');
      }
    }
  }
);

leaf.subscribe((val) => console.log(val));
leaf.$do.setName('Bob');
leaf.$do.save();
console.log('after save');

/**
 * {id: 0, name: '', status: 'new', err: null}
 * {id: 0, name: 'Bob', status: 'new', err: null}
 * {id: 0, name: 'Bob', status: 'saving', err: null}
 * 'after save'
 * {id: 1000, name: 'Bob', status: 'saved', err: null}
 */
```

### Async actions

Actions are designed to be **synchronous**; any errors that happen asynchronously are _NOT going to get trapped by the 
try/catch_ around the transaction that contains the action. 

If you want to use async systems in your leaf, you can either: 

1. write an async function OUTSIDE the leaf and call custom actions from inside that function
2. write an action that uses promises, and put other actions as listeners inside  
   the `promiseFunction().then(listener).catch(listener)`. 

## value

THe value of a Leaf can be anything; however, in order not to make branching "wierd", the *form* 
of a leaf should not change(see below for details); you don't usually want to replace an object with an array,
though there are ways that can be done. (see "any" below);

Values are expansive, like React (classic) state; you can add properties on the fly via "next" to objects,
or keys to Map instances, or expand the lengths of arrays. 

Setter actions are inferred from the keys of Maps/objects on creation. If you add keys, call `myLeaf.inferActions()`
to add setters for any new keys.

```javascript

let leaf = new Leaf({x: 1, y: 2});
leaf.subscribe((val) => console.log(val));

leaf.next({x: 3, z: 4});
leaf.inferActions();
leaf.$do.setZ(5);
/**
 * {x: 1, y: 2}
 * {x: 3, y: 2, z: 4}
 * {x: 3, y: 2, z: 5}
 * 
 */

```

if you want to delete keys from the value call `myLeaf.deleteKeys('x', 'y')`. Any matching branches will be completed
and deleted. 

```javascript

  const pt = new Leaf({
      x: 0,
      y: 0,
      z: 0,
    });

    pt.subscribe(value => console.log(value));

    pt.delKeys('y');

      // { x: 0, y: 0, z: 0 },
      // { x: 0, z: 0 },
    
    pt.$do.setY();
    // throws 

```

## `subscribe(listener)`

Leaves follow the observable pattern of RxJS; it has the following methods/properties:

* **subscribe(listener)**
* **next(value)**
* **complete()**

`subscribe(listener)` delegates to a BehaviorSubject() instance that gets updated every time
a transaction finishes in which changes have been made. This can ge because of a set action,
a next() call, etc. 

It returns a subscriber that can of course be `.unsubscribe()`d. 

Subscription is the best way to observe changes to a Leaf. 

Your listener can be a function or an object dictionary of functions, 
`{next(value), error(err), complete()}`. 

## `next(value)`

Next signals an update for a leaf's value. Changes will percolate across any branches; complex forms
(Maps, objects) will attempt to blend (merge into, combine with) the existing value a la React's `setState()`.

Next will throw if the update is not of the same form as the current value(unless `any` has been set to true),
and will trigger any manual tests you may have written. The update of this value, its parent(s), and any changed 
branch children will be atomic, wrapped via transact() 

## type and form

Leaf remembers the *form* of the first value of the leaf as one of
- `FORM_MAP`
- `FORM_OBJECT`
- `FORM_ARRAY` 
- `FORM_LEAF`
- `FORM_FUNCTION`
- `FORM_VALUE` (if none of the above is true). 

This ia fairly coarse test; you can replace a number with a string, say, or null,
and Leaf will allow it. 

If *type* is set, Leaf restricts updates of scalar values to a more specific value type:

- `TYPE_STRING`
- `TYPE_NUMBER`
- `TYPE_DATE`

You can also set the type explicitly using these constants, or an array of 
constants `[TYPE_DATE, TYPE_NUMBER]` to accept any of several types/forms. 

If you want to restrict the type of a leaf's properties, define a branch for that property
with type = true in the options (or one of the constants defined above for specific expectations)

### `TYPE_ANY`

If you want to disable ALL type checking, pass `any` = true on configurations;
this sets the type to TYPE_ANY and bypasses all form and type checking. 

### A word of caution on branches and types

The assumption made herein is that if you have a "parent" leaf with branches,
then it's a "container" leaf whose type (object, Map or array) is not changed
on updates, and *should* not be changed. The form checks are designed to safeguard
against this happening, but can be broken if you try real hard (or set any = true). 

Clearly, not changing container types is in your best interest. 

## tests

Tests check values for any number of conditions and any positive return value or thrown error will preempt a change from
passing through and initiate a cross-system rollback to the previous state. Either throwing errors or returning 
values (or errors) will signal a test failure. Returning falsy values (or not explicitly returning anything) will
allow the value to pass. 

There is no guaranteed order of execution of tests.

Test functions are passed a Change instance that has the following signature: 
{
  target : (your leaf)
  value: (your submitted change)
  next: (a blend of your change and the current value -- or in simpler types, will be identical to value)
}

Do not attempt to change the value or the target leaf in any way inside a test. 

```javascript

const numLeaf = new Leaf(0, {
  test({ next }): string | void {
    if (next < 0) throw new Error('cannot be negative');
    if (next % 2) return 'must be even';
  },
  debug: false,
});

numLeaf.subscribe(value => console.log('leaf value: ', value));

numLeaf.next(4);

try {
  numLeaf.next(5);
} catch (err) {
  console.log('error:', err);
}
 console.log('leaf is still', numLeaf.value);

numLeaf.next(8);
try {
  numLeaf.next(-4);
} catch (err2) {
  console.log('error 2:', err2);
}
console.log('leaf is still', numLeaf.value);
numLeaf.next(10);
      
/**
  leaf value:  0
  leaf value:  4
  error: Error: must be even
  leaf is still 4
  leaf value:  8
  error 2: Error: cannot be negative
  leaf is still 8
  leaf value:  10
*/

```


## Options

The second property of Leaf can be an object with any/all/none of these properties:

* **name** - an identifier for the leaf. set/overridden for Leaf 
  instances made/passed into `.branch(name, value)`
* **test** - a function; will be passed each change, as it is asserted; if it returns anything "truthy" (not zero, null, etc),
  will block the updating of a Leaf.
* **actions** - an object of name/function accessible off the `.$do` object property of your Leaf.
* **branches** - an object of name/branch values(or Leaf instances). Note, even if your Leaf
  is a Map, your Branches can be defined by an object. 
* **type** - if true, then rejects any values that don't match the type (string, number, etc.)
  of the initial value; Also takes one of the type flags:
  - TYPE_STRING
  - TYPE_NUMBER
  - TYPE_DATE
  - FORM_MAP
  - FORM_OBJECT
  - FORM_ARRAY
  - FORM_FUNCTION
  - an array of acceptable types. 
* **any** if true, disables ALL type / form checking.
* **debug** - a boolean that if true, will echo extended data; used to develop Leaf code.
  You can set/extend these values post-creation by calling `.config(opts)` to, say, add
some actions or branches to a Leaf instance at any time. 

  ## `.complete()` and `.isStopped`

Leaves follow the observable pattern of an RxJS Observable, including the option to complete(); a complete Leaf
will resist attempts to update it, will bork all actions before they begin, and will throw on attempt to call 
`.next(...)`.

Completing a Leaf will also complete the subject attached to any subscription via `.subscribe(listener)`. 

the value of a leaf will still be available for inspection. 

You are not obligated to complete a Leaf, but it's a good idea if its context is about to be closed, to prevent any
functions that might be in flight. 

calling `complete()` sets the `.isStopped` read-only boolean to be set to true; if you are writing actions that can 
directly or indirectly trigger `complete()`, you may want to double-check `.isStopped` inside your own code to ensure
your leaf is still active.
