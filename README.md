# st4t3

An ultra-simple, tiny, typesafe state machine library designed to handle large
state graphs for latency-sensitive applications. It requires minimal memory
allocations, and allows you to break large state machines into many files
rather than forcing you to define the machine entirely in one file to get full
type safety. There are no runtime dependencies and the code is <110 lines of
TypeScript, excluding comments.

## Development

Build with `npm run build`. Test with `npm run test`. Check the test coverage
report with `npm run coverage`.

## API

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
    this.transition("Land");
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
    this.transition("Jump");
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
const machine = new Machine("Land", {
  Jump, Land
});

machine.start(); // Prints "landed."
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
    this.transition("Land");
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
    this.transition("Jump");
  }
}
```

## What if I want a state that never transitions?

```typescript
import { TransitionTo } from "st4t3";

export default Final extends TransitionTo<never> {
}
```

## Events

States emit events when they start and stop, and you can listen to them via a
slimmed-down version of the NodeJS EventEmitter API.

### `on('start' | 'stop', callback)`

Runs the callback every time either `start` or `stop` is called. For example:

```typescript
machine.state("Land").on("start", () => {
  // ...
});
```

### `off('start' | 'stop', callback)`

Removes the callback from being registered to listen to either the `start` or
`stop` event. Returns `true` if the callback was previously registered and thus
removed; returns `false` otherwise, indicating the callback was never
registered in the first place. For example:

```typescript
machine.state("Land").off("start", callback);
```

### `once('start' | 'stop', callback)`

Runs the callback the first time either `start` or `stop` is called, and then
removes it from the listener list. For example:

```typescript
machine.state("Land").once("start", () => {
  // ...
});
```

## Type safety

* When you create a new `Machine` instance, it checks for exhaustiveness at
  compile time: you can't accidentally forget to include a state that one of
  your other states needs to transition to.
* Any method defined on *all* your states is callable from `machine.current()`.
  You don't need any special type definitions to make this happen; it's
  automatically inferred. If you want to call a method on a specific state, you
  can call it from `machine.state("state name goes here")`, although generally
  I wouldn't recommend calling methods on non-current states &mdash; otherwise,
  why are you using a state machine?
* A state can only transition to the states it names in its class definition.
  As a result, you have to use string literals &mdash; the compiler can't
  analyze dynamic strings passed in at runtime. That being said, this
  restriction also helps human maintainers understand which states transition to
  which other states... And helping human maintainers understand your state
  graph is probably a big part of why you're using a state machine.

## Performance

`st4t3` allocates all of the state classes when you call the `Machine`
constructor:

```typescript
// Jump and Land are allocated here:
const machine = new Machine("Land", { Jump, Land });
```

These state instances are long-lived: the `Machine` class will reuse them and
won't re-instantiate. This reduces allocations at runtime; however, the cost is
that memory usage will be slightly higher than allocating on-demand.

This also means if you want to use instance variables to track changes in
between `start` and `stop` calls in your state classes, you can; they don't get
reset. This may be an advantage or a disadvantage depending on your
perspective. Probably you'll be happier if you don't use tons of mutable state.

Unlike some other libraries, there's no special registry of machines: this
means you don't need to worry about machine memory leaks, since they get garbage
collected like every other JS object.
