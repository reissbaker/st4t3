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

Question: currently, message handlers can be undefined; is this actually useful
or is this a now-unused tsc-appeasing remnant of the old optional `stop`
message? It seems like they shouldn't be allowed to be undefined, and it also
seems like forcing them to be functions would clean up a bit of the type
hoop-jumping around `Params` vs `Parameters`.

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
