I think you can force props to be invariant if you remove `parent` from the
props, and have it be its own field, tracked separately from Props. Then the
parent can be allowed to vary with `any`, and you can force the Props to be
invariant.

Weird tricky thing with the Machine not letting props be invariant at all, but
maybe that's sortable.

Child props have got to be able to vary from parent or else you'll be tracking
a bunch of useless props across multiple unrelated child machines. I think you
can solve this with "static props" injectable to the machine at instantiation
time. The machine's injectable props and the props passed to start must form
the full machine props hash. That way child machines can have extra props
hidden from other children; since child machines are only created at start()
time, this should be fine for game engine purposes where you can't alloc
certain resources until the engine is in some kind of ready state.

https://github.com/eram/ts-fsm has an interesting idea to use dispatchable
events rather than explicit method calls. This would simplify proxying all
calls down to the children. Sketch of an alternative impl:

```typescript
const start = transitionTo<'next'>((transition, props, parent) => {
  return {
    events: {
      start() {
      },
      stop() {
      },
      custom() {
        transition("next");
      },
    },
  };
});

const next = transitionTo<never>(() => {
  return {};
});

const machine = new Machine({
  initial: "start",
  states: { start },
});
machine.start({ ... });
machine.dispatch('custom');
machine.stop();
```
