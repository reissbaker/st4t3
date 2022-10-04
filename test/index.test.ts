import { vi, expect, it, describe, beforeEach } from "vitest";
import { TransitionTo, Machine, AllChildMachineNames } from "../index";

function withMockFn(klass: { prototype: any }, name: string, cb: (m: ReturnType<typeof vi.fn>) => any) {
  const original = klass.prototype[name];
  try {
    const mock = klass.prototype[name] = vi.fn();
    cb(mock);
  } finally {
    klass.prototype[name] = original;
  }
}

abstract class Base extends TransitionTo<"Bar" | "Foo" | "Final"> {
  test() {}
}

class Foo extends Base {
  next() {
    this.transitionTo("Bar");
  }
  end() {
    this.transitionTo("Final");
  }
  foo() {}
}

class Bar extends Base {
  next() {
    this.transitionTo("Foo");
  }
  end() {
    this.transitionTo("Final");
  }
}

class Final extends TransitionTo<never> {
  test() {}
  next() {}
  end() {}
}

function machine() {
  return new Machine({
    initial: "Foo",
    states: {
      Foo, Bar, Final
    },
  });
}

describe("State Machines", () => {
  type MachineType = ReturnType<typeof machine>;
  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>(ctx => {
    ctx.machine = machine();
  });

  it<Should>("set the current state to the initial transition string on start", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toBeInstanceOf(Foo);
  });

  it<Should>("start the current state when started", ({ machine }) => {
    const spy = machine.currentEvents().on("start", vi.fn());
    machine.start({});
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("stop the current state when stopped", ({ machine }) => {
    const spy = machine.currentEvents().on("stop", vi.fn());
    machine.start({});
    expect(spy).toHaveBeenCalledTimes(0);
    machine.stop();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("allow accessing methods on #current() that all states define", ({ machine }) => {
    withMockFn(Foo, "test", (spy) => {
      machine.start({});
      machine.current().test();
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  it<Should>("allow transitions between states", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toBeInstanceOf(Foo);
    machine.current().next();
    expect(machine.current()).toBeInstanceOf(Bar);
  });

  it<Should>("call stop on states when transitioning off of them", ({ machine }) => {
    const spy = machine.currentEvents().on("stop", vi.fn());
    machine.start({});
    expect(spy).toHaveBeenCalledTimes(0);
    machine.current().next();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call start on states when transitioning into them", ({ machine }) => {
    const spy = machine.events('Bar').on("start", vi.fn());
    machine.start({});
    machine.current().next();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call stop on the old state before calling start on the new state", ({ machine }) => {
    let stopCalls = 0;
    let startCalls = 0;
    machine.events('Bar').on("start", () => {
      expect(stopCalls).toEqual(1);
      startCalls++;
    });
    machine.events('Foo').on("stop", () => {
      stopCalls++;
    });
    machine.start({});
    machine.current().next();
    expect(startCalls).toEqual(1);
  });

  it<Should>("say it's running after being started", ({ machine }) => {
    expect(machine.running()).toEqual(false);
    machine.start({});
    expect(machine.running()).toEqual(true);
  });

  it<Should>("say it's not running after being stopped", ({ machine }) => {
    machine.start({});
    machine.stop();
    expect(machine.running()).toEqual(false);
  });

  it<Should>("reset to the initial state after a new start call", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toBeInstanceOf(Foo);
    machine.current().next();
    expect(machine.current()).toBeInstanceOf(Bar);
    machine.stop();
    expect(machine.current()).toBeInstanceOf(Bar);
    machine.start({});
    expect(machine.current()).toBeInstanceOf(Foo);
  });

  it<Should>("not reset on multiple start calls in a row", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toBeInstanceOf(Foo);
    machine.current().next();
    machine.start({});
    expect(machine.current()).toBeInstanceOf(Bar);
  });

  it<Should>("only call start() on states once for repeated start invocations", ({ machine }) => {
    const spy = machine.currentEvents().on("start", vi.fn());
    machine.start({});
    machine.start({});
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("only call stop() on states once for repeated stop invocations", ({ machine }) => {
    const spy = machine.currentEvents().on("stop", vi.fn());
    machine.start({});
    machine.stop();
    machine.stop();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("not call stop() on states unless it already started", ({ machine }) => {
    const spy = machine.currentEvents().on("stop", vi.fn());
    machine.stop();
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it<Should>("call start again if stop has been called in between invocations", ({ machine }) => {
    const spy = machine.currentEvents().on("start", vi.fn());
    machine.start({});
    machine.stop();
    machine.start({});
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it<Should>("call stop again if start has been called in between invocations", ({ machine }) => {
    const spy = machine.currentEvents().on("stop", vi.fn());
    machine.start({});
    machine.stop();
    machine.start({});
    machine.stop();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it<Should>("throw a useful error upon transition if it was never started", ({ machine }) => {
    expect(() => machine.transitionTo("Bar")).toThrowError("State machine was never started");
  });

  it<Should>("throw a useful error on current() if it was never started", ({ machine }) => {
    expect(() => machine.current()).toThrowError("No current state: was the machine ever started?");
  });

  it<Should>("throw a useful error upon transition if it was stopped", ({ machine }) => {
    machine.start({});
    machine.stop();
    expect(() => machine.current().next()).toThrowError("State machine is stopped");
  });

  it<Should>("unregister once() listeners after the first invocation", ({ machine }) => {
    let called = 0;
    machine.currentEvents().once("start", () => called++);
    machine.start({});
    machine.stop();
    machine.start({});
    expect(called).toBe(1);
  });

  it<Should>("unregister listeners when off() is called", ({ machine }) => {
    let called = 0;
    const cb = machine.currentEvents().on("start", () => called++);
    machine.start({});
    machine.currentEvents().off("start", cb);
    machine.stop();
    machine.start({});
    expect(called).toEqual(1);
  });

  it<Should>("return false from off() if the listener isn't registered", ({ machine }) => {
    let called = 0;
    const cb = machine.currentEvents().on("start", () => called++);
    machine.start({});
    machine.currentEvents().off("start", cb);
    machine.stop();
    machine.start({});
    expect(called).toEqual(1);
    expect(machine.events('Foo').off("start", cb)).toEqual(false);
  });

  it<Should>("not transition to a duplicate of the current state", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toBeInstanceOf(Foo);
    withMockFn(Foo, "start", (spy) => {
      machine.transitionTo("Foo");
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  it<Should>("remove handlers for a state event when you call clear()", ({ machine }) => {
    const spy = machine.currentEvents().on("start", vi.fn());
    machine.events('Foo').clear();
    machine.start({});
    expect(spy).toHaveBeenCalledTimes(0);
  });
});


describe("State machines with initial state args", () => {
  class Jump extends TransitionTo<'Land', { allowDoubleJumps: boolean }> {
    jump() {}
    land() {
      this.transitionTo('Land');
    }
  }

  class Land extends TransitionTo<'Jump', { bounceOnLand: boolean }> {
    land() {}
    jump() {
      this.transitionTo('Jump');
    }
  }

  const jumpProps = {
    allowDoubleJumps: false,
    bounceOnLand: true,
  };
  function jumpMachine() {
    return new Machine({
      initial: "Land",
      states: {
        Jump, Land
      }
    });
  }

  type MachineType = ReturnType<typeof jumpMachine>;
  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>((ctx) => {
    ctx.machine = jumpMachine();
  });

  it<Should>("set the initial state args as the state's props", ({ machine }) => {
    const spy = vi.fn((state: Land) => {
      expect(state.props).toBe(jumpProps);
    });
    machine.events('Land').on("start", spy);
    machine.start(jumpProps);
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("set the state args as props on transition to the next state", ({ machine }) => {
    const spy = vi.fn((state: Jump) => {
      expect(state.props).toBe(jumpProps);
    });
    machine.events('Jump').on("start", spy);
    machine.start(jumpProps);
    machine.current().jump();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("allow the props to be set to new data after a stop", ({ machine }) => {
    const firstStart = vi.fn((state: Land) => {
      expect(state.props).toBe(jumpProps);
    });
    machine.events('Land').once("start", firstStart);
    machine.start(jumpProps);
    expect(firstStart).toHaveBeenCalledOnce();

    const nextJumpProps = {
      allowDoubleJumps: true,
      bounceOnLand: false,
    };
    const secondStart = vi.fn((state: Land) => {
      expect(state.props).toBe(nextJumpProps);
    });
    machine.events('Land').once("start", secondStart);
    machine.stop();
    machine.start(nextJumpProps);
    expect(secondStart).toHaveBeenCalledOnce();
  });
});


describe("Child states", () => {
  class ParentJump extends TransitionTo<'Land'> {
    readonly children = {
      jumpState: new Machine({
        initial: "FirstJump",
        states: { FirstJump, DoubleJump },
      }),
    };

    jump() {
      this.children.jumpState.current().jump();
    }

    land() {
      this.transitionTo("Land");
    }
  }

  class Land extends TransitionTo<'ParentJump'> {
    readonly children = {
      landState: new Machine({
        initial: "JustLanded",
        states: {
          JustLanded, Still
        },
      }),
    };

    jump() {
      this.transitionTo("ParentJump");
    }
    land() {}
  }

  class JustLanded extends TransitionTo<'Still'> {
  }
  class Still extends TransitionTo<never> {
  }

  class FirstJump extends TransitionTo<'DoubleJump', { parent: ParentJump }> {
    jump() {
      this.transitionTo("DoubleJump");
    }
  }

  class DoubleJump extends TransitionTo<never> {
    // No-op
    jump() {}
  }

  function jumpMachine() {
    return new Machine({
      initial: "Land",
      states: {
        ParentJump, Land,
      },
    });
  }

  type MachineType = ReturnType<typeof jumpMachine>;
  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>((ctx) => {
    ctx.machine = jumpMachine();
  });

  it<Should>("Call start on child machines when they're started", ({ machine }) => {
    const mock = machine.events('Land').child('landState').events('JustLanded').on("start", vi.fn());
    machine.start({});
    expect(mock).toHaveBeenCalledOnce();
  });

  it<Should>("Call start on child machines when they're entered", ({ machine }) => {
    const mock = machine
                 .events('ParentJump')
                 .child('jumpState')
                 .events('FirstJump')
                 .on('start', vi.fn());
    machine.start({});
    expect(mock).toHaveBeenCalledTimes(0);
    machine.current().jump();
    expect(mock).toHaveBeenCalledOnce();
  });

  it<Should>("Call stop on child machines when they're stopped", ({ machine }) => {
    const mock = machine
                 .events('Land')
                 .child('landState')
                 .events('JustLanded')
                 .on('stop', vi.fn());
    machine.start({});
    machine.stop();
    expect(mock).toHaveBeenCalledOnce();
  });

  it<Should>("Call start even on deeply nested machines", () => {
    class MostOuter extends TransitionTo<never> {
      readonly children = {
        child: new Machine({
          initial: "Outer",
          states: { Outer },
        }),
      };
    }
    class Outer extends TransitionTo<never> {
      readonly children = {
          child: new Machine({
          initial: "Inner",
          states: { Inner },
        })
      };
    }
    class Inner extends TransitionTo<never> {
      readonly children = {
        child: new Machine({
          initial: "MostInner",
          states: { MostInner },
        }),
      };
    }
    class MostInner extends TransitionTo<never> {}

    const machine = new Machine({
      initial: "MostOuter",
      states: { MostOuter },
    });

    const mock = machine
                 .events("MostOuter")
                 .child("child")
                 .events("Outer")
                 .child("child")
                 .events("Inner")
                 .child("child")
                 .events("MostInner")
                 .on("start", vi.fn());

    machine.start({});
    expect(mock).toHaveBeenCalledOnce();
  });
});
