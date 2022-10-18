# st4t3

An ultra-simple, tiny-but-powerful, typesafe state machine library designed to
handle large state graphs with minimal memory usage. It only keeps a single
state instance in memory at a time, and allows you to break large state
machines into many files rather than forcing you to define the machine entirely
in one file to get full type safety. There are no runtime dependencies and the
code is <350 lines of TypeScript, excluding comments.

* [Development](#development)
* [Getting started](#getting-started)
* [Injecting props](#injecting-props)
* [Events](#events)
* [Nested state machines](#nested-state-machines)
* [Type safety](#type-safety)
* [Performance](#performance)

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
    messages: {
      // Stop is a special message that fires whenever you're leaving a state
      stop() {
        console.log("stopping jumping");
      },
      land() {
        // Since you declared you can transition to the "Land" state, you can call
        // that here.
        state.goto("Land");
      },
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
    messages: {
      jump() {
        state.goto("Jump");
      }
    },
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

// Long form:
export const LongFormFinal = create.transition<never>().build(state => {
  return state.build({});
});
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
    messages: {
      land() { state.goto("Land") }
    }
  });
});

type LandProps = Pick<Props, "bounceOnLand">;
type LandMessages = Pick<Messages, "jump">;
const Land = create.transition<"Jump", LandMessages, LandProps>().build(state => {
  if(this.props.bounceOnLand) console.log("Bouncy land");
  else console.log("Unbouncy land");
  return state.build({
    messages: {
      jump() { state.goto("Jump"); }
    }
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
props being constant through a single run of a state machine; you only get to
reset them when you call `stop()` and then a new invocation of `start()`.

## Constant props

You can also have constant props that will never change, even between `start`
calls; instead of passing them in at `start()` time, you instead pass them in
when constructing the machine, like so:

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

# Events

States emit events when they start and stop, and you can listen to them via a
slimmed-down version of the NodeJS EventEmitter API. All state EventEmitters
are accessible from `machine.events('StateName')`; for example, to register for
the `Jump` state's `start` event, you'd do the following:

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

The st4t3 library has built-in support for nested (also called "hierarchical")
state machines, using the `children` property. State machines nested
inside states will automatically be started when the parent state starts, and
stopped when the parent stops, and will have the parent's props passed to it at
start time. All messages dispatched to the parent will also be forwarded to the
child. For example:

```typescript
import * as create from "st4t3";

type Messages = {
  jump(): void,
  land(): void,
};

const InitialJump = create.transition<"DoubleJump", Pick<Messages, "jump">>().build(state => {
  console.log("initial jump");
  return state.build({
    messages: {
      jump() {
        state.goto("DoubleJump");
      }
    },
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
      jumpMachine: create.machine<Messages>().build({
        initial: "InitialJump",
        states: { InitialJump, DoubleJump },
      }),
    },
    messages: {
      land() { state.goto("Land"); },
    },
  });
});

const Land = create.transition<"Jump", Pick<Messages, "jump">>().build(state => {
  return state.build({
    messages: {
      jump() {
        state.goto("Jump");
      },
    }
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
    child: create.machine().build({
      initial: "MostInner",
      states: { MostInner },
    }),
  },
  messages: {},
}));

const Outer = create.transition().build(s => s.build({
  children: {
    child: create.machine().build({
      initial: "Inner",
      states: { Inner },
    }),
  },
  messages: {},
}));

const MostOuter = create.transition().build(s => s.build({
  children: {
    child: create.machine().build({
      initial: "Outer",
      states: { Outer },
    }),
  },
  messages: {},
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

# Type safety

* When you create a new `Machine` instance, it checks for exhaustiveness at
  compile time: you can't accidentally forget to include a state that one of
  your other states needs to transition to.
* A state can only transition to the states it names in its class definition.
  As a result, you have to use string literals &mdash; the compiler can't
  analyze dynamic strings passed in at runtime. That being said, this
  restriction also helps human maintainers understand which states transition to
  which other states... And helping human maintainers understand your state
  graph is probably a big part of why you're using a state machine.

# Performance

`st4t3` allocates the state objects on-demand, when you call `start` or `goto`.
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
machine.transitionTo("Jump");
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
