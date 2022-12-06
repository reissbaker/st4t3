# St4t3

A small-but-powerful typesafe state machine library designed to handle large
state graphs with minimal memory usage. It only keeps a single state instance
in memory at a time per-machine, and allows you to break large state machines
into many files rather than forcing you to define the machine entirely in one
file to get full type safety. There are no runtime dependencies and the code is
<850 lines of TypeScript, excluding comments.

* [Development](#development)
* [Getting started](#getting-started)
* [Injecting props](#injecting-props)
* [Following events from other
  libraries](#following-events-from-other-libraries)
* [Events](#events)
* [Nested state machines](#nested-state-machines)
* [Middleware](#middleware)
* [Manually transitioning states from the
  machine](#manually-transitioning-states-from-the-machine)
* [Type safety](#type-safety)
* [Performance](#performance)
* [Comparison to alternatives](#comparison-to-alternatives)

# Development

Build with `npm run build`. Test with `npm run test`. Check the test coverage
report with `npm run coverage`.

# Getting started

Every state machine is composed of three parts: a set of messages, a set of
states, and the machine that runs the states.

To define the messages, define a type or interface with some functions:

```typescript
export type Messages = {
  jump(): void,
  land(): void,
};
```

The total set of messages exists purely in the type system; it has no runtime
representation or cost. Messages sent at runtime are just the string name of
the message, alongside any arguments the function takes; the TypeScript
compiler will typecheck them for you just like it typechecks ordinary function
calls.

States can listen to these messages and act on them:

```typescript
import * as create from "st4t3";
import { Messages } from "./messages";

// You must pass the names of any states you plan on transitioning to in the
// state definition and any messages you listen to, like so:
export const Jump = create.transition<"Land", Pick<Messages, "land">>().build(state => {
  console.log("jumped!");

  return state.build({
    messages: goto => state.msg({
      // Since we declared we listen to the "land" message, we can (and must)
      // define a message handler of the same name here
      land() {
        // Since you declared you can transition to the "Land" state, you can call
        // that here. The TypeScript compiler ensures you can only `goto`
        // states you've defined in the `transition` function above
        goto("Land");
      },
    }),

    // Stop runs whenever you're leaving a state
    stop() {
      console.log("stopping jumping");
    },
  });
});
```

Now let's look at what a `Land` state might look like:

```typescript
import * as create from "st4t3";
import { Messages } from "./messages";

export const Land = create.transition<"Jump", Pick<Messages, "jump">>().build(state => {
  console.log("landed");

  return state.build({
    messages: goto => state.msg({
      jump() {
        goto("Jump");
      }
    }),
  });
});
```

Now that we have our two states, `Jump` and `Land`, transitioning between each
other, let's wire them up in a state machine so they can run:

```typescript
import * as create from "st4t3";
import { Messages } from "./messages";
import { Jump } from "./jump";
import { Land } from "./land";

// Pass in the initial state name, as well as the state classes themselves:
const machine = create.machine<Messages>().build({
  initial: "Land",

  // Note that this is an object, not an array! Object shorthand syntax allows
  // you to leave out the keys if the values are already named the same as the
  // keys. We use the key names to help with typechecking, so that's why this
  // must be written in object shorthand syntax rather than as an array
  states: {
    Jump, Land
  }
});

machine.start({}); // Prints "landed."
machine.dispatch("jump"); // Prints "jumped!"
machine.dispatch("jump"); // No-op, since the jump state ignores further jump messages
machine.dispatch("land"); // Prints "stopping jumping" and then "landed."
```

## What if I want a state that never transitions?

```typescript
import * as create from "st4t3";

// Short form:
export const Final = create.transition().build();

// Longer form:
export const LongerFormFinal = create.transition<never>().build(state => {
  return state.build();
});

// Longest form:
export const LongestFormFinal = create.transition<never>().build(state => {
  return state.build({
    messages: () => state.msg({}),
  });
});
```

## Message parameters

Sometimes you may want to pass data along with your messages; for example, if
movement is being controlled by an analog stick, you'd want to know how much
the stick is being tilted. The message type can have functions define
parameters, and then the `dispatch` function will require you to pass them in
for those messages; e.g.:

```typescript
type Messages = {
  jump(): void,
  move(x: number, y: number),
};

const machine = create.machine<Messages>().build({
  // ...
});

machine.start({});
machine.dispatch("move", 0.5, 0.2); // Compiler checks you pass x, y here
machine.dispatch("jump"); // Compiler checks you pass nothing here
```

# Injecting props

Sometimes, you may want your set of states to accept some sort of configuration
data, or to be able to pass some kind of top-level data from your program into
the states so they can take action on it &mdash; similar to React's `props`.
States can optionally define data they require, and at `Machine#start()` time
you'll need to provide it. In the state class, you can access the data by
reading `this.props`. For example:

```typescript
export type Messages = {
  jump(): void,
  land(): void,
};

export type Props = {
  jumpPower: number,
  bounceOnLand: boolean,
};
```

```typescript
type JumpProps = Pick<Props, "jumpPower">;
type JumpMessages = Pick<Messages, "land">;
const Jump = create.transition<"Land", JumpMessages, JumpProps>().build(state => {
  console.log(`Jumped with power ${state.props.jumpPower}`);
  return state.build({
    messages: goto => state.msg({
      land() { goto("Land") }
    })
  });
});

type LandProps = Pick<Props, "bounceOnLand">;
type LandMessages = Pick<Messages, "jump">;
const Land = create.transition<"Jump", LandMessages, LandProps>().build(state => {
  if(this.props.bounceOnLand) console.log("Bouncy land");
  else console.log("Unbouncy land");
  return state.build({
    messages: goto => state.msg({
      jump() { goto("Jump"); }
    })
  });
});

const machine = create.machine<Messages, Props>().build({
  initial: "Land",
  states: {
    Jump, Land,
  },
});

// You have to pass in all of the data required here. The type system checks
// that all specified data is actually passed in.
machine.start({
  bounceOnLand: false,
  jumpPower: 5.6,
}); // Prints "Unbouncy land"
machine.jump();  // Prints "Jumped with power 5.6"
```

Props remain the same from the initial `start()` call through all `goto()`
calls &mdash; you don't need to pass props into transitions. You can think of
props being valid through a single run of a state machine; you only need to
reset them when you call `stop()` and then a new invocation of `start()`.

That being said, although you're not *required* to propagate them yourself
through each `goto` call, you may update them on state transitions via `goto`
if you want to. For example:

```typescript
type Direction ='north' | 'south' | 'east' | 'west';
type Props = {
  direction: Direction;
};
type Messages = {
  move(dir: Direction): void,
  still(): void,
};

const Still = create.transition<'Move', Pick<Messages, 'move'>, Props>().build(state => {
  playAnim(`stand-${state.props.direction}`);

  return state.build({
    messages: goto => state.msg({
      move(direction) {
        goto('Move', { direction });
      },
    }),
  });
});

const Move = create.transition<'Still' | 'Move', Messages, Props>().build(state => {
  playAnim(`walk-${state.props.direction}`);

  return state.build({
    still() {
      goto('Still');
    },
    move(direction) {
      if(direction === state.props.direction) return;
      goto('Move', { direction });
    },
  });
});

```

## Static props

You can also have static props that are used for every invocation of the
machine, and aren't passed into and overwritten on every `start` call; instead
of passing them in at `start()` time, you instead pass them in when
constructing the machine, like so:

```typescript
const machine = create.machine<Messages, Props>().build({
  initial: "Land",
  states: {
    Jump, Land,
  },
  props: {
    jumpPower: 5.6,
  },
});

// Since you already specified `jumpPower` in the machine constructor, you only
// pass in `bounceOnLand` here. This is enforced by the type system.
machine.start({
  bounceOnLand: false,
}); // Prints "Unbouncy land"
machine.jump();  // Prints "Jumped with power 5.6"
```

Note that both static props and regular props can be updated via `goto`; the
only difference is that static props don't need to be passed into
`machine.start`. This can be useful for nesting machines, where the inner state
machine has extra props that the outer one doesn't need to be aware of.

## Updating props inside message handlers

As shown above, you can update props upon transition via `goto(state, props)`.
If you want to update props inside message handlers *without* triggering a
state change, you can do that too:

```typescript
type Messages = {
  update(msg: string): void,
};
type Props = {
  msg: string,
};

const State = create.transition<"Next", Messages, Props>().build(state => {
  return state.build({
    // The second parameter of the messages function is a `set` function. It
    // allows you to update any of the props of your state, similar to `goto`
    // but without causing a state transition. All it does is update props: it
    // doesn't re-run any initialization code.
    // If you want to re-run your initialization code, just use `goto` and
    // transition to yourself!
    messages: (goto, set) => state.msg({
      update(msg) {
        set({ msg });
      },
    }),
  });
});
```

# Following events from other libraries

It's pretty common to want to make state transitions based on outside events,
either from other libraries (Node file watching?) or the DOM. You might try to
do something like this:

```typescript
type Messages = {
  next(): void;
};

const State = create.transition<"Next", Messages>().build(state => {
  const buffer = [];
  emitter.on("event", (data) => {
    if(data === "next") {
      state.dispatch("next");
      return;
    }
    buffer.push(data);
  });

  return state.build({
    messages: goto => state.msg({
      next() {
        goto("Next");
      }
    }),
  });
});
```

But... there's potentially a subtle problem here. Let's assume `emitter` is
going to keep emitting more data, even after the `"next"` message. We haven't
deregistered from it, so as more data comes in, `State` will keep buffering it,
causing a memory leak! And worse, if it sees the special `"next"` string a
second time, it'll cause a state transition again, even if it's not the current
state!

One way of handling this would be to manually deregister every event handler on
the `stop` function. But that's pretty error-prone, since you can easily add a
handler and forget to deregister it. St4t3 provides a helpful `follow` API that
wraps Node-style EventEmitters, or DOM-style
`addEventListener`/`removeEventListener` objects, and will automatically
deregister any event handler passed through the `follow` API when the state
stops or is transitioned away from. A fixed version of the previous example
would look like:

```typescript
type Messages = {
  next(): void,
};

const State = create.transition<"Next", Messages>().build(state => {
  const buffer = [];
  state.follow.on(emitter, "event", (data) => {
    if(data === "next") {
      state.dispatch("next");
      return;
    }
    buffer.push(data);
  });

  return state.build({
    messages: goto => state.msg({
      next() {
        goto("Next");
      },
    }),
  });
});
```

The `follow.on` call works with Node-style EventEmitters, and objects with
`addEventListener`/`removeEventListener` functions &mdash; there's no
`follow.addEventListener`, because `follow.on` will transparently use that if
`on`/`off` don't exist. It's also typesafe, and if your EventEmitter is typed
to only handle certain events, or takes callbacks of different types depending
on the event, the `follow` API will mirror whatever types passed-in emitter
accepts or rejects.

The `follow` object supports the full range of `on`, `off`, and `once` calls,
just like ordinary Node-style EventEmitters.

# Events

States emit events when they start and stop, and you can listen to them via a
slimmed-down version of the NodeJS EventEmitter API. (And yes, that means you
can listen to other machines with the `state.follow` API!) All state
EventEmitters are accessible from `machine.events('StateName')`; for example,
to register for the `Jump` state's `start` event, you'd do the following:

```typescript
machine.events("Jump").on("start", (props: JumpProps) => {
  // ...
});

// Or, since type inference works on callbacks, you can leave out the type:
machine.events("Jump").on("start", (props) => {
  // ...
});
```

The state names passed in as strings are type-checked to ensure that you're
actually referring to a real state that exists in the state machine you
defined, and didn't typo "Jupm" instead of "Jump."

All events generated by state machines take the props as the first argument to
the callback (although you can of course leave it out if you don't need it).
However, the EventEmitter API is fairly generic, if you want to import it and
use it for your own purposes; it takes a single type parameter defining the
mapping of event names to callback data. For example, to define your own event
emitters that have `update` and `render` events that provide `Physics` and
`Graphics` data to callbacks, you'd do:

```typescript
type EventMapping = {
  update: Physics,
  render: Graphics,
};

const emitter = new EventEmitter<EventMapping>();

// Example listeners:
emitter.on("update", (physics) => {
});
emitter.on("render", (graphics) => {
});

// Example emit calls:
emitter.emit("update", somePhysicsObject);
emitter.emit("render", someGraphicsObject);
```

## EventEmitter API

### `on('start' | 'stop', callback)`

Runs the callback every time either `start` or `stop` is called. For example:

```typescript
machine.events("Land").on("start", (props) => {
  // ...
});
```

### `off('start' | 'stop', callback)`

Removes the callback from being registered to listen to either the `start` or
`stop` event. Returns `true` if the callback was previously registered and thus
removed; returns `false` otherwise, indicating the callback was never
registered in the first place. For example:

```typescript
machine.events("Land").off("start", callback);
```

### `once('start' | 'stop', callback)`

Runs the callback the first time either `start` or `stop` is called, and then
removes it from the listener list. For example:

```typescript
machine.events("Land").once("start", (props) => {
  // ...
});
```

### `clear()`

Removes all listeners for all events, effectively resetting the EventEmitter.
For example:

```typescript
machine.events("Land").clear();
```

It's rare you'd want to do this for state machines, but may be useful if you're
using this as a generic EventEmitter class.

# Nested state machines

The St4t3 library has built-in support for nested (also called "hierarchical")
state machines, using the `children` property. State machines nested
inside states will automatically be started when the parent state starts, and
stopped when the parent stops, and will have the parent's props passed to it at
start time. All messages dispatched to the parent will also be forwarded to the
child.

Child state machines are created with `state.child<Messages, Props>()` rather
than `create.machine<Messages, Props>()`, in order to track type information
about parent states. The type system enforces that you create the child state
machines this way; it's impossible to accidentally forget and use the top-level
machine builder instead of `state.child`.

For example:

```typescript
import * as create from "st4t3";

type Messages = {
  jump(): void,
  land(): void,
};

const InitialJump = create.transition<"DoubleJump", Pick<Messages, "jump">>().build(state => {
  console.log("initial jump");
  return state.build({
    messages: goto => state.msg({
      jump() {
        goto("DoubleJump");
      }
    }),
  });
});

const DoubleJump = create.transition().build(state => {
  console.log("double jump");
  // Triple jumps are not allowed, so just ignore all messages
  return state.build({});
});

const Jump = create.transition<"Land", Pick<Messages, "land">>().build(state => {
  return state.build({
    children: {
      jumpMachine: state.child<Messages>().build({
        initial: "InitialJump",
        states: { InitialJump, DoubleJump },
      }),
    },
    messages: goto => state.msg({
      land() { goto("Land"); },
    }),
  });
});

const Land = create.transition<"Jump", Pick<Messages, "jump">>().build(state => {
  return state.build({
    messages: goto => state.msg({
      jump() {
        goto("Jump");
      },
    })
  });
});

const machine = create.machine<Messages>().build({
  initial: "Land",
  states: { Land, Jump },
});

// Runs the function to create the Land state
machine.start({});

// Land#stop is called, and Jump#start and InitialJump#start are then called:
machine.dispatch("jump");

// InitialJump#stop is called, then DoubleJump#start is called:
machine.dispatch("jump");

// Jump#stop and DoubleJump#stop are called, then Land#start is called:
machine.dispatch("land");
```

Nested state machines, like all state machines, don't need to all be defined in
the same file; it's completely valid to break apart the states into separate
files.

## A note about child prop types

Since child machines have their `machine.start({ ... })` functions called with
the parent's props, there are some restrictions on what the child machine's
props must be:

1. Child machines must accept all of the parent's props. Otherwise, the
   `machine.start({ ... })` call would be invalid, since it would be passing in
   props that the `start` function doesn't ordinarily accept.
2. Child machines can't declare parent props as static, since static props
   can't be passed into `machine.start({ ... })` &mdash; and parents will pass
   all of their props into the child machines `start` method.
3. If child machines define extra props unknown to the parent, they must be
   declared as static props, since the parent won't know to pass those unknown
   props to the child's `start` method.

These restrictions are checked by the compiler, so it's impossible to
accidentally have these kinds of bugs. Note that this is only applicable to
child *machines* &mdash; the child states themselves can ignore props they
don't use, like any other kind of state.

These restrictions are in fact the primary reason for the design of static
props: without static props &mdash; that is, if all props had to be passed into
`machine.start({ ... })` &mdash; it would be impossible to have child states
with differing props from their parents, since the parents couldn't pass in
data they didn't know existed to the child machines.

## Subscribing to nested events:

The events API also supports subscribing to nested state machine events with
full type safety, by using the chainable `child(machineName)` method:

```typescript
machine
  .events("Jump")
  .child("jumpMachine")
  .events("InitialJump")
  .on("start", (props) => {
  });
```

Much like the ordinary `events` API, the nested machine names passed in as
strings are type-checked by the TypeScript compiler to ensure that they refer
to real, nested state machines that you've actually defined on the given
states. You can continue chaining these calls to arbitrarily-deeply-nested
machines; for an example taken directly from our test suite:

```typescript
const MostInner = create.transition().build(s => s.build());

const Inner = create.transition().build(s => s.build({
  children: {
    child: s.child().build({
      initial: "MostInner",
      states: { MostInner },
    }),
  },
  messages: () => s.msg({}),
}));

const Outer = create.transition().build(s => s.build({
  children: {
    child: s.child().build({
      initial: "Inner",
      states: { Inner },
    }),
  },
  messages: () => s.msg({}),
}));

const MostOuter = create.transition().build(s => s.build({
  children: {
    child: s.child().build({
      initial: "Outer",
      states: { Outer },
    }),
  },
  messages: () => s.msg({}),
}));

const machine = create.machine().build({
  initial: "MostOuter",
  states: { MostOuter },
});

const mock = machine
             .events("MostOuter")
             .child("child")
             .events("Outer")
             .child("child")
             .events("Inner")
             .child("child")
             .events("MostInner")
             .on("start", vi.fn());

machine.start({});
```

## Dispatching to a parent

Children can opt-in to a special `parent` variable getting passed in at
construction time, allowing them to dispatch messages back to their parent. All
they need to do is specify what messages they expect to be able to send to
their parent; for example:

```typescript
const DoubleJump = create.transition<
  never,
  DoubleJumpMessages,
  Props,
  ParentMessages
>().build((state, parent) => state.build({
  messages: () => state.msg({
    someMessage() {
      parent.dispatch("someParentMessage");
    },
  }),
});
```

Dispatching to a parent is equivalent to dispatching to the parent's machine;
the parent will get the message, and it will be forwarded to all children as
well.

# Middleware

Middleware allows you to extract commonly-used message handling and reuse it
across many states. Middleware objects are just states, constructed just like
any other state; for example:

```typescript
type Props = {
  msg: string;
};

type Messages = {
  print(): void;
};

const Middleware = create.transition<never, Messages, Props>().build(state => state.build({
  messages: () => state.msg({
    print() {
      console.log(state.props.msg);
    }
  }),
}));

// It's okay to not define `print` here, since we're using middleware that defines it for us
const State = create.transition<never, Messages, Props>().middleware({ Middleware }).build();

const machine = create.machine<Messages, Props>().build({
  initial: "State",

  // You don't need to pass Middleware in here, since it's only being used as
  // middleware and can't be independently transitioned to
  states: { State },
});
```

Note that, like machine creation, the `.middleware` function takes an object
literal rather than an array. Although object ordering is only [recently-defined
in the spec](https://github.com/tc39/ecma262/pull/1791), in practice every
major browser maintained consistent insertion-order traversal for years prior
to this spec change, as long as you didn't use exotic host objects, modify the
prototype of an object mid-traversal, use the magic `Proxy` objects, or a few
other arcane things. Just use regular hashes for this and you'll be fine!
Pretend it's an array.

Middleware can also do state transitions, just like ordinary states. If
middleware causes a state transition, it will prevent the rest of the chain
from running; e.g.:

```typescript
type Messages = {
  next(): void,
};
type Props = {
  skip: boolean,
};

const Middleware = create.transition<"Next", Messages, Props>().build(state => state.build({
  messages: goto => state.msg({
    next() {
      if(state.props.skip) {
        console.log("Skipped");
        goto("Next");
      }
    },
  }),
}));

const Initial = create.transition<
  "Next", Messages, Props
>().middleware({ Middleware }).build(state => state.build({
  messages: goto => state.msg({
    console.log("Not skipped");
    goto("Next");
  }),
});

const Next = create.transition().build();

const machine = create.machine({
  initial: "Initial",
  states: { Initial, Next },
});

machine.start({
  skip: false,
});

machine.dispatch("next"); // Prints "Not skipped" and transitions to next
machine.stop();
machine.start({
  skip: true,
});
machine.dispatch("next"); // Prints "Skipped" and transitions to next
```

## Middleware type contract

Middleware needs to fulfill a specific type contract, which is checked by the
TypeScript compiler:

1. If it transitions to another state via `goto(...)`, its specifications for
   which states it transitions to must be a subset or equal to the states that
   the calling state transitions to. To put it another way: if the middleware
   was declared with `create.transition<"Next">()`, the state using that
   middleware must *at least* also transition to `"Next"` (it can also
   transition to other states the middleware is unaware of; `"Next" | "Final"`
   is fine).
2. Middleware can respond to either a superset of or a subset of messages that
   the calling state responds to (or exactly the same set of messages). If
   there's no overlap, it'll be an error.
3. If the middleware uses props, they must be a subset of (or equal to) the
   props that the calling state uses.

## State type changes using middleware

When states use middleware, any messages the middleware responds to become
optional in the state using the middleware. For example: if your middleware
defines a message handler for `print`, you don't need to define your own
message handler for `print`, even if your `create.transition` call says you
respond to `print` (ordinarily, saying that you respond to `print` but not
defining a message handler for it is an error). This is meant as a convenience
to allow you to refactor commonly-used message handlers out into shared
middleware, and not force callers to then define empty, dummy method handlers
just to fulfill a type contract.

## Middleware states and machine creation

If you use a state solely as middleware, you don't need to pass it into the
machine's `states` hash: it'll get automatically included since you already
called `.middleware({ ... })` on it. If you use a state as both middleware
*and* an independent state you can transition to, you do need to tell the
machine about it by passing it into the `states` hash.

## Adding props from middleware

Sometimes, middleware may create or read data that it wants to pass on to any
states that use it; for example, a piece of middleware might read user data and
make it available to states. You can do this by adding a `props` key to the
hash given to `state.build({ ... })`; for example:

```typescript
const UserMiddleware = create.transition().build(state => {
  const user = store.getUser();
  return state.build({
    messages: () => state.msg({}),
    props: {
      user,
    },
  });
});

const middleware = { UserMiddleware };

type Props = {
  user: User
};
// You could also write the above as: type Props = create.MiddlewareProps<typeof middleware>;

const State = create.transition<
  "Next",
  {},
  Props
>().middleware(middleware).build(state => {
  console.log(state.props.user);
  return state.build();
});
```

If you specify props in middleware, you won't need to pass those props into the
machine, since the middleware is already handling them; for example, a machine
for the state above would look like:

```typescript
// You don't need to specify the user prop, since the middleware handles it
const machine = create.machine().build({
  initial: "State",
  states: { State },
});

// Similarly, you don't need to pass it in here:
machine.start({});
```

Middleware props can be anything, as long as they don't conflict with other
props you're using for the state. If your state's props specify `msg: string`,
your middleware can't return `{ msg: 5 }`: that's a type error.

## Updating returned props from middleware

For machine-wide props, you can use `goto` or `set` to update the props. But
since middleware props are scoped to just the props returned by that
middleware, those will result in type errors if you try to update your own
returned props from within a middleware; for example:

```typescript
type Messages = {
  tick(): void,
};

type Props = {
  allowDoubleJumps: boolean,
};

const Middleware = create.transition<never, Messages, Props>().build(state => {
  let value = 0;
  return state.build({
    props: { value },
    messages: (_, set) => state.msg({
      tick() {
        value++;
        // The following is a type error, since our Props are { allowDoubleJumps: boolean }!
        set({ value });
      },
    }),
  });
});
```

To update *returned* props from a middleware, you can use the `forward`
function:

```typescript
const Middleware = create.transition<never, Messages, Props>().build(state => {
  let value = 0;
  return state.build({
    props: { value },
    messages: (_1, _2, forward) => state.msg({
      tick() {
        value++;
        forward({ value });
      },
    }),
  });
});
```

The `forward` function will update the props you set in the `props` field, and
will also notify any client states of the middleware that the props changed,
and cause them to update their copy of the props.

# Manually transitioning states from the machine

You can manually attempt state transitions on the state machine itself; for
example:

```typescript
machine.goto('Land');
```

This works identically to `goto`, except that by default it will ignore the
call if you're already in the specified state; e.g. if you're currently in
state `Land`, calling `machine.goto('Land')` is a no-op. If you want to force
it to rerun the `Land` initialization, use `machine.force('Land')`.

States themselves don't have this restriction: if you want to transition to
yourself, you may, as long as you declare that transition when you create the
state, e.g.

```typescript
const Land = create.transition<'Land' | 'Jump', /* ... */>().build(state => {
  return state.build({
    messages: goto => state.msg({
      someMessage() {
        goto('Land');
      }
    }),
  });
});
```

This difference is purely for developer experience: typically when you call
`machine.goto`, what you mean to do is to ensure the machine is in that state;
you aren't necessarily trying to re-run that state if it's already there.
Whereas the only use case for calling `goto('YOUR_OWN_NAME')` is to re-run
initialization code; if you didn't mean to do that, you could instead simply do
nothing (since you know you're already in your own state).

# Type safety

* When you create a `machine`, it checks for exhaustiveness at compile
  time: you can't accidentally forget to include a state that one of your other
  states needs to transition to.
* When you create a `machine`, it also checks to make sure the `Props` type
  you've given it matches the props expected by the states. If a state requires
  a property, you can't accidentally forget to include it in the machine props.
* When you create a `child`, it makes sure that the parent state actually
  responds to all of the messages the child states have requested to be able to
  send to the parent. You can't create children that will dispatch events to
  you that you don't know about.
* That being said, children are allowed to have their own events you don't know
  about, as long as they aren't dispatching them back to you; they might use
  those events to privately communicate to their own children, for example.
  Similarly, your parent is allowed to have events you don't know about. The
  only assertion is that if a child declares it will send *you* a message, you
  must be aware of that message.
* A state can only transition to the states it names in its class definition.
  As a result, you have to use string literals &mdash; the compiler can't
  analyze dynamic strings passed in at runtime. That being said, this
  restriction also helps human maintainers understand which states transition to
  which other states... And helping human maintainers understand your state
  graph is probably a big part of why you're using a state machine.

# Performance

St4t3 allocates the state objects on-demand, when you call `start` or `goto`.
It only keeps the current state in memory (or no states in memory, prior to the
first `start` call).

```typescript
// Jump and Land are not allocated yet
const machine = create.machine<Messages, Props>().build({
  initial: "Land",
  states: { Jump, Land }
});

// Land is allocated here:
machine.start({});
// The Land instance is overwritten by a new Jump allocation here:
machine.goto("Jump");
```

All callbacks registered through the `.events` API are kept in memory for the
lifetime of the state machine, though, since the state machine needs to keep
track of which ones exist in order to call them when it instantiates or gets
rid of states.

The state instances are not long-lived: the `Machine` class will regenerate
them every time they're transitioned to. This means that memory usage is
minimal, but at the cost of increased runtime allocations. Ideally don't do
lots of transitions inside tight loops.

Unlike some other libraries, there's no special registry of machines: this
means you don't need to worry about machine memory leaks, since they get garbage
collected like every other JS object.

# Comparison to alternatives

### XState

XState is the 800lb gorilla in the room of JS/TS state machine libraries.
Although XState and St4t3 have similar goals in terms of making stateful code
more understandable and reducing explicit branching, they implement different
programming models: XState allows modeling finite state machines and
statecharts, whereas St4t3 is similar to a "transition system" (also called an
"infinite state machine"). Finite state machines have lexical power equivalent
to a regex; I'm not familiar with formalized lexical power of statecharts, but
since they're largely just hierarchical finite state machines, they in practice
don't seem to be particularly more expressive &mdash; although allowing
hierarchical machines is at least much more convenient than flat ones. On the
other hand, St4t3 is Turing-complete. (To convince myself that this is true, I
modeled a Brainfuck interpreter in St4t3, found in `examples/brainfuck.ts`.)

For states that can be modeled by a finite state machine, XState allows
excellent tooling; it provides, for example, visualizations of every state in
the system, the inputs, and the state transitions caused by any input. However,
for complex systems, you may need to model many, many states and/or inputs, and
in some cases it may not be possible to model your domain in XState. If you
can't [parse it with a
regex](https://stackoverflow.com/questions/1732348/regex-match-open-tags-except-xhtml-self-contained-tags),
you can't model it with a finite state machine, and modeling it with a
statechart will either be difficult or perhaps impossible.

On the other hand, since St4t3 is Turing-complete, tooling is by definition
more limited, since making strong guarantees about whether certain code will
run or halt given various inputs is NP-complete. However, you'll be able to
model just about anything a programming language can represent, and it will
often be more concise than doing so in XState. Because XState doesn't use
ordinary TypeScript to determine things like whether or not an input should
result in a state transition, it needs to invent its own sub-language for e.g.
branching, using a variety of "guard" types expressed as JSON instead of an `if`
statement. St4t3 just uses `if` statements, or whatever other TypeScript code
you'd want to use.

XState is also much larger and more complex than St4t3; the "core"
implementation (the feature-complete version, but without counting any of the
external tooling) is roughly 7x the code count. It's hefty.

### TS-FSM

TSM-FSM is a lovely little finite state machine library whose `Events` system
inspired St4t3's message dispatch system. It's extremely small, and if you know
you want a finite state machine, it looks like a nice one.

The same lexical power caveats apply, but even more strongly, since TS-FSM is
strictly capable of modeling finite state machines and not statecharts. If you
can't parse it with a regex, you can't model it with TS-FSM; and for complex
state graphs it will become increasingly cumbersome, since it doesn't support
nested state machines.
