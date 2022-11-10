import { vi, expect, it, describe, beforeEach } from "vitest";
import * as create from "../index";

describe("Middleware", () => {
  type Messages = {
    update(delta: number): void;
  };

  it("Should run before the main state's dispatch function", () => {
    let middlewareRan = false;
    let stateRan = false;
    const Middleware = create.transition<never, Messages>().build(state => state.build({
      messages: msg => msg.build({
        update(_: number) {
          middlewareRan = true;
        },
      }),
    }));

    const State = create.transition<never, Messages>().middleware({ Middleware }).build(state => {
      return state.build({
        messages: msg => msg.build({
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
      messages: msg => msg.build({
        update(_: number) {
          middlewareRan = true;
          msg.goto("Final");
        }
      }),
    }));

    const State = create.transition<"Final", Messages>().middleware({ Middleware }).build(state => {
      return state.build({
        messages: msg => msg.build({
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
});
