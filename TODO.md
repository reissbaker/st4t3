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

It might be useful to allow the dispatch method to take data, and enforce that
the machine define its events handled upfront. For example:

```typescript
type Events = {
  hello: "world",
  empty: null,
};
const machine = new Machine<Events>({
});

machine.dispatch("hello", "world");
machine.dispatch("empty", null);
```


HMMMMM does this imply the machine is simply... An EventEmitter? Rather than
defining event handlers like the above, what about:

```typescript
transitionTo<'next', Events>((machine, props, parent) => {
  machine.once('start', () => {
  });

  machine.once('stop', () => {
  });
});
```

No that's fucked up. Way too easy to leak memory by using `.on` instead of
`.once`. But, you could implement it behind the scenes that way. The machine
shouldn't *be* an EventEmitter, but it *has* an eventemitter; `dispatch`
proxies to `emit`, and the `events` hash gets set to the machine's `once`
stuff. No, this is also annoying bc you have to register and deregister
everything all the time. Just build it separately as its own thing, but reuse
the idea of statically defining an events type.

Cool API:

```typescript
const state = events<Events>().edges<Edges>(({ transition, props }) => {
  // This function runs on start

  // Return event handlers and child machines
  return {
    children: {
    },
    events: {
      someEvent() {
        transition("someEdge");
      },
    },
  }
});

const childState = events<Events>()
 .edges<Edges>()
 .withParent<Events, Edges>(({ transition, props, parent }) => {
 });
```

You should add a follow API to automatically deregister from event emitters
when a state stops. Rather than registering to events, do something like:

```typescript
follow.on(emitter, "event", () => {
  // ...
});
```

Otherwise you'll get memory leaks and/or weird behavior when your state "stops"
but hasn't cleaned up emitters it registered to. You can handle arbitrary
node-like EventEmitter APIs, not just your own, so that it works with
everything.
