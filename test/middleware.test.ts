import { expect, it, describe, vi } from "vitest";
import * as create from "../index";

describe("Middleware", () => {
  type Messages = {
    update(delta: number): void;
  };

  it("Should run before the main state's dispatch function", () => {
    let middlewareRan = false;
    let stateRan = false;
    const Middleware = create.transition<never, Messages>().build(state => state.build({
      messages: () => state.msg({
        update(_: number) {
          middlewareRan = true;
        },
      }),
    }));

    const State = create.transition<never, Messages>().middleware({ Middleware }).build(state => {
      return state.build({
        messages: () => state.msg({
          update(_: number) {
            expect(middlewareRan).toBeTruthy();
            stateRan = true;
          }
        }),
      });
    });

    const machine = create.machine<Messages>().build({
      initial: "State",
      states: { State },
    });
    machine.start({});
    machine.dispatch("update", 1);
    expect(stateRan).toBeTruthy();
  });

  it("Should short-circuit the main state's dispatch if it calls goto", () => {
    let middlewareRan = false;
    let stateRan = false;

    const Middleware = create.transition<"Final", Messages>().build(state => state.build({
      messages: goto => state.msg({
        update(_: number) {
          middlewareRan = true;
          goto("Final");
        }
      }),
    }));

    const State = create.transition<"Final", Messages>().middleware({ Middleware }).build(state => {
      return state.build({
        messages: () => state.msg({
          update(_: number) {
            stateRan = true;
          }
        }),
      });
    });

    const Final = create.transition().build();

    const machine = create.machine<Messages>().build({
      initial: "State",
      states: { State, Final },
    });

    machine.start({});
    machine.dispatch("update", 1);
    expect(middlewareRan).toBeTruthy();
    expect(stateRan).toBeFalsy();
  });

  it("Should get access to the parameters passed to dispatch", () => {
    let middlewareRan = false;
    const Middleware = create.transition<never, Messages>().build(state => state.build({
      messages: () => state.msg({
        update(delta: number) {
          expect(delta).toBe(5);
          middlewareRan = true;
        },
      }),
    }));
    const State = create.transition<never, Messages>().middleware({ Middleware }).build();
    const machine = create.machine<Messages>().build({
      initial: "State",
      states: { State },
    });
    machine.start({});
    machine.dispatch("update", 5);
    expect(middlewareRan).toBeTruthy();
  });

  it("Should get access to the props passed in", () => {
    type Props = {
      doubleJump: boolean,
    };
    let middlewareRan = false;
    const Middleware = create.transition<never, {}, Props>().build(state => {
      expect(state.props.doubleJump).toBeTruthy();
      middlewareRan = true;

      return state.build({
        messages: () => state.msg({}),
      });
    });

    const State = create.transition<never, {}, Props>().middleware({ Middleware }).build();
    const machine = create.machine<{}, Props>().build({
      initial: "State",
      states: { State },
    });
    machine.start({ doubleJump: true });
    expect(middlewareRan).toBeTruthy();
  });

  it("Should run multiple middlewares in order", () => {
    let firstMiddlewareRan = false;
    let secondMiddlewareRan = false;
    let lastMiddlewareRan = false;
    type Messages = {
      msg(): void;
    };

    // Just to make sure lexical sorting isn't happening, call the first middleware B instead of A
    const middlewareB = create.transition<never, Messages>().build(state => state.build({
      messages: () => state.msg({
        msg() {
          expect(firstMiddlewareRan).toBeFalsy();
          expect(secondMiddlewareRan).toBeFalsy();
          expect(lastMiddlewareRan).toBeFalsy();
          firstMiddlewareRan = true;
        }
      }),
    }));

    const middlewareA = create.transition<never, Messages>().build(state => state.build({
      messages: () => state.msg({
        msg() {
          expect(firstMiddlewareRan).toBeTruthy();
          expect(secondMiddlewareRan).toBeFalsy();
          expect(lastMiddlewareRan).toBeFalsy();
          secondMiddlewareRan = true;
        }
      }),
    }));

    const middlewareC = create.transition<never, Messages>().build(state => state.build({
      messages: () => state.msg({
        msg() {
          expect(firstMiddlewareRan).toBeTruthy();
          expect(secondMiddlewareRan).toBeTruthy();
          expect(lastMiddlewareRan).toBeFalsy();
          lastMiddlewareRan = true;
        },
      }),
    }));

    const State = create.transition<never, Messages>().middleware({
      middlewareB,
      middlewareA,
      middlewareC
    }).build();

    const machine = create.machine<Messages>().build({
      initial: "State",
      states: { State },
    });

    machine.start({});
    machine.dispatch("msg");
    expect(firstMiddlewareRan && secondMiddlewareRan && lastMiddlewareRan).toBeTruthy();
  });

  it("should collapse multiple props from middlewares into the state's props", () => {
    const A = create.transition().build(state => state.build({
      messages: () => state.msg({}),
      props: {
        msg: "hello world",
      },
    }));
    const B = create.transition().build(state => state.build({
      messages: () => state.msg({}),
      props: {
        log: true,
      },
    }));

    const middleware = { A, B };

    type MachineProps = {
      count: number,
    };
    type Props = create.MiddlewareProps<typeof middleware> & MachineProps;

    const State = create.transition<never, {}, Props>().middleware(middleware).build(state => {
      expect(state.props.msg).toBe("hello world");
      expect(state.props.log).toBeTruthy();
      expect(state.props.count).toBe(5);
      return state.build();
    });

    const machine = create.machine<{}, MachineProps>().build({
      initial: "State",
      states: { State },
    });

    const spy = machine.events("State").on("start", vi.fn());

    machine.start({
      count: 5,
    });

    expect(spy).toHaveBeenCalledOnce();
    // Make sure we aren't leaking the middleware props back out
    expect(machine.props()).toStrictEqual({
      count: 5,
    });
  });
});
