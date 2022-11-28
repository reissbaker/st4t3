## async

You should make states be optionally async (ideally at low runtime cost for
non-async states); would be super useful for loading resources or general
server-side use. Quick sketch of how this could work: machines act as message
*queues*, rather than simply fire-and-forget dispatching, and passes a `done`
callback into the state dispatchers. Non-async state dispatchers instantly call
`done`; async state handlers call `done` after waiting for the returned
promise. Technically we already have dispatch queues; we just only use them to
handle `dispatch` calls during state initialization. Fairly proven concept in
this codebase.

Actually you don't need explicit async vs non-async dispatchers for this...
Just check if the message handler returns a promise. If it does, wait for it;
otherwise call `done` immediately.

You'll need an async version of `dispatch` that's different than the sync
version, or else you'll pay the cost of a promise every single dispatch, which
is unrealistic for games. This starts to require some very hairy type
introspection; e.g. async middleware can't be used in non-async states. Not
sure if this is a usable approach.

TBQH there's another possible approach here: use self-dispatching for async.
Then an async state is the same as a sync state: message handlers don't specify
a return type, so there's no reason they *can't* be async... It's just that you
can't `await machine.dispatch(...)`. But you can
`machine.events("NextState").once("start", ...)`, which is functionally
similar. Buuuuuuut, big downside is that middleware can't stop execution of the
rest of the chain while it waits for resources.

Okay, next take on async: you could have `machine.dispatch('...')` return a
not-quite-a-promise object with a `promise()` method: if you call the method,
it'll generate a promise that finishes when the `done` function is called (on
the next microtick of the VM yada yada like the Promise spec demands; it'll use
real, host Promise objects). That way you can avoid the overhead of promises if
you want to, but server-side users can opt into using async stuff.

## random

Use expect-type to test type narrowing: https://github.com/mmkal/expect-type

Future work: middleware right now is nice, but it would be useful to have a few
more knobs to turn:

* Middleware should be able to run before or after the main state; right now it
  always runs before. Can accomplish this by making the `.middleware` function
  require a machine-like `{ states: { Middleware } }` hash rather than a plain
  `{ Middleware }` hash, so that you can have overloads on it where you do e.g.
  `{ before: { states: { Beforeware } }, after: { states: { Afterware } }`.
* Would be very nice to have arbitrary functions as middleware, of type
  signature: `(msg: keyof Messages, props: Props, ...data: /* ... */) => any`.
  With the structure from above, you could add a `functions` key to the hash,
  and pass an array of middleware functions. Since they're so arbitrary, they
  don't change the main states type at all (e.g. you still need to define all
  of `Messages`); think of them like `method_missing` from Ruby.

Child machines should probably propagate their prop updates upwards.

StateDispatchers have props specified as `any`, because Middleware operates on
explicit StateDispatchers rather than just the interfaces we care about. If
`props` is a field with an explicit type, `tsc` tries to include it in
structural type checking, which fails because we allow props to be subsets of
each other rather than exact matches. If you switch middleware to instead
operate on type interfaces, I think it should work without unnecessary `any`
usage... And will be more resilient to changes in the future. UPDATE: no, this
doesn't work. Probably need to read more about variance.
