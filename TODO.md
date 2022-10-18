You should add a follow API to automatically deregister from event emitters
when a state stops. Rather than registering to events, do something like:

```typescript
state.follow.on(emitter, "event", () => {
  // ...
});
```

Otherwise you'll get memory leaks and/or weird behavior when your state "stops"
but hasn't cleaned up emitters it registered to. You can handle arbitrary
node-like EventEmitter APIs, not just your own, so that it works with
everything.

You should make states be optionally async (ideally at low runtime cost for
non-async states); would be super useful for loading resources or general
server-side use. Quick sketch of how this could work: machines act as message
*queues*, rather than simply fire-and-forget dispatching, and passes a `done`
callback into the state dispatchers. Non-async state dispatchers instantly call
`done`; async state handlers call `done` after waiting for the returned
promise.

Actually you don't need explicit async vs non-async dispatchers for this...
Just check if the message handler returns a promise. If it does, wait for it;
otherwise call `done` immediately.

You need to track the type of the Children in StateBuilder. Currently you can
have nested inner child machines with incompatible props compared to the outer
machine. It's ok to have fewer props; it's ok to have extra StaticProps (but
not extra DynamicProps); but it's not ok to have incompatible DynamicProps.
Really you probably need to track the DynamicProps of child StateBuilders. Or
rather, you need to track the DynamicProps of StateDispatchers with children.
(You don't know the Children type at StateBuilder time).

Use expect-type to test type narrowing: https://github.com/mmkal/expect-type
