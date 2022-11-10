import { vi, expect, it, describe } from "vitest";
import * as create from "../index";

describe("Self dispatching from within states", () => {
  type Messages = {
    next(): void,
  };

  it("Should dispatch to itself", () => {
    const Initial = create.transition<"Next", Messages>().build(state => {
      state.dispatch("next");

      return state.build({
        messages: msg => msg.build({
          next() {
            msg.goto("Next");
          },
        }),
      });
    });

    const Next = create.transition().build();

    const machine = create.machine<Messages>().build({
      initial: "Initial",
      states: { Initial, Next },
    });

    const spy = machine.events("Next").on("start", vi.fn());
    machine.start({});
    expect(spy).toHaveBeenCalledOnce();
  });

  it("Should no-op when called inside stop()", () => {
    let nextCalled = false;
    const State = create.transition<never, Messages>().build(state => state.build({
      messages: msg => msg.build({
        next() {
          nextCalled = true;
        }
      }),
      stop() {
        state.dispatch("next");
      }
    }));

    const machine = create.machine<Messages>().build({
      initial: "State",
      states: { State },
    });

    machine.start({});
    machine.stop();
    expect(nextCalled).toBeFalsy();
  });

  it("Should no-op when called inside stop() on a transition", () => {
    let nextCalled = false;
    type FullMessages = Messages & {
      final(): void,
    };

    const Initial = create.transition<"Final", FullMessages>().build(state => state.build({
      messages: msg => msg.build({
        next() {
          nextCalled = true;
        },
        final() {
          msg.goto("Final");
        },
      }),
      stop() {
        state.dispatch("next");
      }
    }));

    const Final = create.transition<never, Messages>().build(state => state.build({
      messages: msg => msg.build({
        // Make sure that this function also isn't called! Or else we open up a communication hole
        // between states, which probably should be handled by props.
        next() {
          nextCalled = true;
        },
      }),
    }));

    const machine = create.machine<FullMessages>().build({
      initial: "Initial",
      states: { Initial, Final },
    });

    machine.start({});
    machine.dispatch("final");
    expect(nextCalled).toBeFalsy();
  });
});
