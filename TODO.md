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

Use expect-type to test type narrowing: https://github.com/mmkal/expect-type

Would be VERY nice to support message middleware. Right now you have to
manually call any middleware-esque functions you want (or do `...middleware`,
but that's dangerous bc later definitions can overwrite the middleware ones);
real middleware support would let you automatically respond to messages before
or after the main state does stuff with them.

Originally my approach to middleware was: what if we try to merge the
dispatchers? But this is absolutely fucked: you need to handle duplicate keys
everywhere, which means that you need to rewrite children machine hashes to be
arrays, and do a bunch of type-dicey merging of message dispatch functions.
Instead, you should just have the DispatchBuildFn functions (which are entirely
internal to st4t3 and not used by clients) return arrays of dispatchers, and
have the machines operate on dispatcher arrays rather than on single
dispatchers. This way you can also easily have a `.before` method and a
`.after` method that make middleware run before or after, without insane method
currying.

No you need explicit middleware for type safety, because we use the concrete
dispatcher class for inference. Oh well. It's actually pretty easy.

If middleware does a goto, it should short-circuit the main message call IMO.
This is how most web frameworks do middleware and otherwise you're going to
incentivize super weird data threading through props to tell the main state to
ignore the message. IMO the main use case for goto() is short-circuiting; why
would you use goto() otherwise?

BTW you need to prevent `goto()` in `stop()` calls, because a) it is insane,
and b) it will prompt insane short circuit behavior. Make it an error? Would be
very cool to have a typesafe way to do this. Is `stop()` actually a message?
Maybe it's something special, that only has access to a neutered StateBuilder
instance. Make it an error for now, but something to think about. It's already
very special cased. Maybe `start()` is the first function passed into
`transition.build`, and `stop()` is the second? Oh god what if
`transition.build` is even more overloaded, and can take an object with `start`
and `stop` functions... Honestly I think this is the way. Much nicer for end
users to have named arguments in a hash instead of two anonymous ones that have
*very* similar types. Stop is not a message. This also simplifies message
dispatching...

Sigh. Once again this doesn't work. `stop()` often wants to clean up data
created by `start()`, and having it in the same closure makes that simple. If
its only shared context is objects in the global context, that becomes
difficult/awkward without memory leaks. Instead we should redo how start works:

```typescript
create.transition<Messages, Props>().build(state => {
  // Initialize here...
  // important: `state` does NOT have `.goto`! That's a function on the `msg`
  // object passed into the `messages` function in `state.build`

  return state.build({
    children:   { /* ... */ },
    middleware: [ /* ... */ ],

    messages: msg => msg.build({
      someMessage() {
        msg.goto('SomeState');
      },
    }),

    stop() {
    },
  });
});
```

Refactor steps:

* [x] Refactor messages to be a function that takes the message builder object
  and returns the message hash.
* [x] Remove `goto` from the state builder class.
* [ ] Add the `stop` method to dispatchers + build args, and remove old special
  casing for `stop` messages. Make sure to propagate stop calls to child
  machines and to middleware. Note that the `stop` function should take an
  optional event emitter... That way you can skip creating a fake emitter for
  the middleware.
* [ ] Update the README

Should methods defined in middleware count towards fulfilling the `Messages`
spec from `transition<Messages>`? Honestly... yes, probably. Sigh. Middleware
should be a hash instead of an array, then, so you can skip the `as const` bs.
