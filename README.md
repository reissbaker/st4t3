# st4t3

An ultra-simple, tiny-but-powerful, typesafe state machine library designed to
handle large state graphs with minimal memory usage. It only keeps a single
state instance in memory at a time, and allows you to break large state
machines into many files rather than forcing you to define the machine entirely
in one file to get full type safety. There are no runtime dependencies and the
code is <200 lines of TypeScript, excluding comments.

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

Every state machine is composed of two parts: a set of states, and the machine
that runs the states. To define a state, you extend the abstract `TransitionTo`
class:

```typescript
import { TransitionTo } from "st4t3";

// You must pass the names of any states you plan on transitioning to in the
// class definition, like so:
export default class Jump extends TransitionTo<"Land"> {
  // Start gets automatically called when a state is entered (or when the
  // machine starts, if you're the initial state)
  start() {
    console.log("jumping!");
  }
  // Stop gets automatically called when you're leaving a state (or when the
  // machine stops, if you're the current state)
  stop() {
    console.log("stopping jumping");
  }

  // Custom code
  jump() {
    // If you're already jumping, do nothing
  }
  land() {
    // Since you declared you can transition to the "Land" state, you can call
    // that here.
    this.transitionTo("Land");
  }
}
```

Now let's look at what a `Land` state would look like:

```typescript
import { TransitionTo } from "st4t3";

export default class Land extends TransitionTo<"Jump"> {
  start() {
    console.log("landed.");
  }

  // Custom code
  land() {
    // If you're already landed, do nothing
  }
  jump() {
    this.transitionTo("Jump");
  }
}
```

Now that we have our two states, `Jump` and `Land`, transitioning between each
other, let's wire them up in a state machine so they can run:

```typescript
import { Machine } from "st4t3";
import Jump from "./jump";
import Land from "./land";

// Pass in the initial state name, as well as the state classes themselves:
const machine = new Machine({
  initial: "Land",
  states: {
    Jump, Land
  }
});

machine.start({}); // Prints "landed."
machine.current().jump(); // Prints "jumped!"
machine.current().jump(); // No-op, since Jump#jump() is a no-op
machine.current().land(); // Prints "stopping jumping" and then "landed."
```

## Reducing code duplication

You might have noticed that the examples above duplicated some boilerplate,
like the no-op method `jump` for the `Jump` class, and `land` for the `Land`
class. It's not that bad for a small state machine, but for a large one, you
might end up with quite a bit of boilerplate. Luckily, TypeScript makes it easy
to remove this boilerplate via inheritance:

```typescript
import { TransitionTo } from "st4t3";

export default abstract class BaseState extends TransitionTo<"Jump" | "Land"> {
  jump() {}
  land() {}
}
```

Then you can slim down the individual states like so:

```typescript
import BaseState from "./base";

export default class Jump extends BaseState {
  start() {
    console.log("jumped!");
  }
  land() {
    this.transitionTo("Land");
  }
}
```

```typescript
import BaseState from "./base";

export default class Land extends BaseState {
  start() {
    console.log("landed.");
  }
  jump() {
    this.transitionTo("Jump");
  }
}
```

## What if I want a state that never transitions?

```typescript
import { TransitionTo } from "st4t3";

export default Final extends TransitionTo<never> {
}
```

# Injecting props

Sometimes, you may want your set of states to accept some sort of configuration
data, or to be able to pass some kind of top-level data from your program into
the states so they can take action on it &mdash; similar to React's `props`.
States can optionally define data they require, and at `Machine#start()` time
you'll need to provide it. In the state class, you can access the data by
reading `this.props`. For example:

```typescript
type JumpProps = { jumpPower: number };
class Jump extends TransitionTo<'Land', JumpProps> {
  start() {
    console.log(`Jumped with power ${this.props.jumpPower}`);
  }

  jump() {}
  land() { this.transitionTo('Land'); }
}

type LandProps = { bounceOnLand: boolean };
class Land extends TransitionTo<'Jump', LandProps> {
  start() {
    if(this.props.bounceOnLand) console.log("Bouncy land");
    else console.log("Unbouncy land");
  }

  jump() { this.transitionTo("Jump"); }
  land() {}
}

const machine = new Machine({
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

The type for the `props` passed into the `start()` call is inferred from the
props defined by the state classes; if you're missing a property that a state
class requires, it'll fail to compile.

Props remain the same from the initial `start()` call through all
`transition()` calls &mdash; you don't need to pass props into transitions. You
can think of props being constant through a single run of a state machine; you
only get to reset them when you call `stop()` and then a new invocation of
`start()`.

# Events

State machines emit events when they start and stop, and you can listen to them
via a slimmed-down version of the NodeJS EventEmitter API. All state
EventEmitters are stored on `machine.events[StateClassName]`; for example, to
register for the `Jump` class's `start` event, you'd do the following:

```typescript
machine.events.Jump.on("start", (state: Jump) => {
  // ...
});

// Or, since type inference works on callbacks, you can leave out the type:
machine.events.Jump.on("start", (state) => {
  // ...
});
```

All events generated by state machines take the state as the first argument to
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
machine.events.Land.on("start", (state) => {
  // ...
});
```

### `off('start' | 'stop', callback)`

Removes the callback from being registered to listen to either the `start` or
`stop` event. Returns `true` if the callback was previously registered and thus
removed; returns `false` otherwise, indicating the callback was never
registered in the first place. For example:

```typescript
machine.events.Land.off("start", callback);
```

### `once('start' | 'stop', callback)`

Runs the callback the first time either `start` or `stop` is called, and then
removes it from the listener list. For example:

```typescript
machine.events.Land.once("start", (state) => {
  // ...
});
```

### `clear()`

Removes all listeners for all events, effectively resetting the EventEmitter.
For example:

```typescript
machine.events.Land.clear();
```

It's rare you'd want to do this for state machines, but may be useful if you're
using this as a generic EventEmitter class.

# Nested state machines

You can build nested (also called "heirarchical") state machines by creating
new machines inside your states. For example:

```typescript
import { TransitionTo } from "st4t3";

class InitialJump extends TransitionTo<"DoubleJump"> {
  start() {
    console.log("initial jump");
  }

  jump() {
    // Double jumps are allowed
    this.transitionTo("DoubleJump");
  }
}

class DoubleJump extends TransitionTo<never> {
  start() {
    console.log("double jump");
  }

  jump() {
    // Triple jumps are not allowed: this is a no-op
  }
}

export default class Jump extends TransitionTo<"Land"> {
  private jumpMachine = new Machine({
    initial: "InitialJump",
    states: { InitialJump, DoubleJump },
  });

  start() {
    // Since we set "InitialJump" as the initial state, calling start() will
    // always first set the state to InitialJump
    this.jumpMachine.start({});
  }

  stop() {
    // Cleanup
    this.jumpMachine.stop();
  }

  jump() {
    // If we've jumped once, this will print "double jump"
    // Otherwise it's a no-op: you can't jump again after you've double-jumped,
    // until you land.
    this.jumpMachine.jump();
  }

  land() {
    this.transitionTo("Land");
  }
}
```

Nested state machines, like all state machines, don't need to all be defined in
the same file; it's completely valid to break apart the states into separate
files.

# Type safety

* When you create a new `Machine` instance, it checks for exhaustiveness at
  compile time: you can't accidentally forget to include a state that one of
  your other states needs to transition to.
* Any method defined on *all* your states is callable from `machine.current()`.
  You don't need any special type definitions to make this happen; it's
  automatically inferred.
* A state can only transition to the states it names in its class definition.
  As a result, you have to use string literals &mdash; the compiler can't
  analyze dynamic strings passed in at runtime. That being said, this
  restriction also helps human maintainers understand which states transition to
  which other states... And helping human maintainers understand your state
  graph is probably a big part of why you're using a state machine.

# Performance

`st4t3` allocates the state classes on-demand, when you call `start` or
`transitionTo`. It only keeps the current state in memory (or no states in
memory, prior to the first `start` call).

```typescript
// Jump and Land are not allocated yet
const machine = new Machine({
  initial: "Land",
  states: { Jump, Land }
});

// Land is allocated here:
machine.start({});
// The Land instance is overwritten by a new Jump allocation here:
machine.transitionTo("Jump");
```

These state instances are not long-lived: the `Machine` class will regenerate
them every time they're transitioned to. This means that memory usage is
minimal, but at the cost of increased runtime allocations. Ideally don't do
lots of transitions inside tight loops.

Unlike some other libraries, there's no special registry of machines: this
means you don't need to worry about machine memory leaks, since they get garbage
collected like every other JS object.
