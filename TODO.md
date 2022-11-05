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
