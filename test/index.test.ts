import { vi, expect, it, describe, beforeEach } from "vitest";
import { TransitionTo, Machine } from "../index";
import * as create from "../src/state-builder";

describe("State Machines", () => {
  type Messages = {
    next(): void,
    end(): void,
  };

  const Foo = create.transition<"Bar" | "Final", Messages>().build(state => state.build({
    messages: {
      next() {
        state.goto("Bar");
      },
      end() {
        state.goto("Final");
      },
    },
  }));

  const Bar = create.transition<"Foo" | "Final", Messages>().build(state => state.build({
    messages: {
      next() {
        state.goto("Foo");
      },
      end() {
        state.goto("Final");
      },
    },
  }));

  const Final = create.transition().build(state => state.build());

  function machine() {
    return create.machine<Messages>().build({
      initial: "Foo",
      states: {
        Foo, Bar, Final
      },
    });
  }

  type MachineType = ReturnType<typeof machine>;
  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>(ctx => {
    ctx.machine = machine();
  });

  it<Should>("set the current state to the initial transition string on start", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Foo");
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

  it<Should>("allow transitions between states", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Foo");
    machine.dispatch("next");
    expect(machine.current()).toStrictEqual("Bar");
  });

  it<Should>("call stop on states when transitioning off of them", ({ machine }) => {
    const spy = machine.currentEvents().on("stop", vi.fn());
    machine.start({});
    expect(spy).toHaveBeenCalledTimes(0);
    machine.dispatch("next");
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call start on states when transitioning into them", ({ machine }) => {
    const spy = machine.events('Bar').on("start", vi.fn());
    machine.start({});
    machine.dispatch("next");
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
    machine.dispatch("next");
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
    expect(machine.current()).toStrictEqual("Foo");
    machine.dispatch("next");
    expect(machine.current()).toStrictEqual("Bar");
    machine.stop();
    expect(machine.current()).toStrictEqual("Bar");
    machine.start({});
    expect(machine.current()).toStrictEqual("Foo");
  });

  it<Should>("not reset on multiple start calls in a row", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Foo");
    machine.dispatch("next");
    expect(machine.current()).toStrictEqual("Bar");
    machine.start({});
    expect(machine.current()).toStrictEqual("Bar");
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
    expect(() => machine.goto("Bar")).toThrowError("State machine was never started");
  });

  it<Should>("throw a useful error upon transition if it was stopped", ({ machine }) => {
    machine.start({});
    machine.stop();
    expect(() => machine.dispatch("next")).toThrowError("State machine is stopped");
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
    expect(machine.current()).toStrictEqual("Foo");

    const spy = machine.currentEvents().on("start", vi.fn());
    machine.goto("Foo");
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it<Should>("remove handlers for a state event when you call clear()", ({ machine }) => {
    const spy = machine.currentEvents().on("start", vi.fn());
    machine.events('Foo').clear();
    machine.start({});
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe("State machines with messages that take arguments", () => {
  type Messages = {
    wake(): void,
    update(delta: number, currentMs: number): void,
  };

  const Stopped = create.transition<'Idle', Pick<Messages, 'update'>>().build((state) => {
    let elapsed = 0;

    return state.build({
      messages: {
        update(delta, currentMs) {
          elapsed += delta;
          if(elapsed > 1000 && currentMs > 1000) state.goto('Idle');
        },
      },
    });
  });

  const Idle = create.transition<'Stopped', Pick<Messages, "wake">>().build(state => state.build({
    messages: {
      wake() {
        state.goto('Stopped');
      }
    }
  }));

  function machine() {
    return create.machine<Messages>().build({
      initial: 'Stopped',
      states: { Stopped, Idle },
    });
  }

  type MachineType = ReturnType<typeof machine>;
  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>(ctx => {
    ctx.machine = machine();
  });

  it<Should>("pass along the arguments", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Stopped");
    machine.dispatch("update", 600, 600);
    expect(machine.current()).toStrictEqual("Stopped");
    machine.dispatch("update", 600, 1200);
    expect(machine.current()).toStrictEqual("Idle");
  });
});

describe("State machines with props", () => {
  type Messages = {
    jump(): void,
    land(): void,
  };
  type Props = {
    allowDoubleJumps: boolean,
    bounceOnLand: boolean,
  };
  const Jump = create.transition<
    'Land',
    Messages,
    Pick<Props, 'allowDoubleJumps'>
  >().build((state) => {
    return state.build({
      messages: {
        jump() {},
        land() {
          state.goto('Land');
        },
      }
    });
  });

  const Land = create.transition<'Jump', Messages, Pick<Props, 'bounceOnLand'>>().build((state) => {
    return state.build({
      messages: {
        land() {},
        jump() {
          state.goto('Jump');
        },
      },
    });
  });

  const jumpProps = {
    allowDoubleJumps: false,
    bounceOnLand: true,
  };
  function jumpMachine() {
    return create.machine<Messages, Props>().build({
      initial: "Land",
      states: {
        Jump, Land
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

  it<Should>("set the initial state args as the state's props", ({ machine }) => {
    const spy = vi.fn((props: Props) => {
      expect(props).toStrictEqual(jumpProps);
    });
    machine.events('Land').on("start", spy);
    machine.start(jumpProps);
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("set the state args as props on transition to the next state", ({ machine }) => {
    const spy = vi.fn((props: Props) => {
      expect(props).toStrictEqual(jumpProps);
    });
    machine.events('Jump').on("start", spy);
    machine.start(jumpProps);
    machine.dispatch("jump");
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("allow the props to be set to new data after a stop", ({ machine }) => {
    const firstStart = vi.fn((props: Props) => {
      expect(props).toStrictEqual(jumpProps);
    });
    machine.events('Land').once("start", firstStart);
    machine.start(jumpProps);
    expect(firstStart).toHaveBeenCalledOnce();

    const nextJumpProps = {
      allowDoubleJumps: true,
      bounceOnLand: false,
    };
    const secondStart = vi.fn((props: Props) => {
      expect(props).toStrictEqual(nextJumpProps);
    });
    machine.events('Land').once("start", secondStart);
    machine.stop();
    machine.start(nextJumpProps);
    expect(secondStart).toHaveBeenCalledOnce();
  });
});

describe("State machines with static props", () => {
  type Messages = {
    next(): void,
  };
  type Props = {
    msg: string,
    count: number,
  };
  const Initial = create.transition<"Final", Messages, Props>().build(state => state.build({
    messages: {
      next() {
        state.goto("Final");
      }
    }
  }));
  const Final = create.transition<never, {}, Props>().build(state => state.build());

  function machine() {
    return create.machine<Messages, Props>().build({
      initial: "Initial",
      states: { Initial, Final },
      props: {
        msg: "hi",
      },
    });
  }

  type MachineType = ReturnType<typeof machine>;
  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>((ctx) => {
    ctx.machine = machine();
  });

  it<Should>("pass the static props through as if they were included in start()", ({ machine }) => {
    const spy = vi.fn((props: Props) => {
      expect(props).toStrictEqual({ msg: "hi", count: 1 });
    });
    machine.events('Initial').on("start", spy);
    machine.start({ count: 1 });
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("keep passing the static props through state transitions", ({ machine }) => {
    const spy = vi.fn((props: Props) => {
      expect(props).toStrictEqual({ msg: "hi", count: 1 });
    });
    machine.events('Final').on("start", spy);
    machine.start({ count: 1 });
    machine.dispatch("next");
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("Child states", () => {
  type Messages = {
    jump(): void,
    land(): void,
  };
  const FirstJump = create.transition<
    'DoubleJump',
    Pick<Messages, 'jump'>
  >().build(state => state.build({
    messages: {
      jump() {
        state.goto('DoubleJump');
      }
    },
  }));

  const DoubleJump = create.transition().build(state => state.build());

  const ParentJump = create.transition<'Land', Messages>().build(s => s.build({
    children: {
      jumpState: create.machine<Messages>().build({
        initial: 'FirstJump',
        states: { FirstJump, DoubleJump },
      }),
    },
    messages: {
      jump() {},
      land() {
        s.goto('Land');
      },
    },
  }));

  const JustLanded = create.transition<'Still'>().build(state => state.build());
  const Still = create.transition().build(state => state.build());

  const Land = create.transition<'ParentJump', Messages>().build(s => s.build({
    children: {
      landState: create.machine().build({
        initial: 'JustLanded',
        states: { JustLanded, Still },
      }),
    },
    messages: {
      jump() {
        s.goto('ParentJump');
      },
      land() {},
    },
  }));

  function jumpMachine() {
    return create.machine<Messages>().build({
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
    const mock = machine
                 .events('Land')
                 .child('landState')
                 .events('JustLanded')
                 .on("start", vi.fn());
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
    machine.dispatch('jump');
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
    const MostInner = create.transition().build(s => s.build());

    const Inner = create.transition().build(s => s.build({
      children: {
        child: create.machine().build({
          initial: "MostInner",
          states: { MostInner },
        }),
      },
      messages: {},
    }));

    const Outer = create.transition().build(s => s.build({
      children: {
        child: create.machine().build({
          initial: "Inner",
          states: { Inner },
        }),
      },
      messages: {},
    }));

    const MostOuter = create.transition().build(s => s.build({
      children: {
        child: create.machine().build({
          initial: "Outer",
          states: { Outer },
        }),
      },
      messages: {},
    }));

    const machine = create.machine().build({
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

  it<Should>("pass a reference to the parent state in the props that can be called", () => {
    // First let's define the outer states
    type Props = { hello: string };
    type Messages = {
      next(): void;
    };
    type HiddenParentMessages = {
      forwardSecond(): void;
    };
    type TopLevelMessages = {
      second(): void;
    }

    // Note: machines with a single state that has no transitions are cursed, because the transition
    // is considered "never" -- which means the _currentName for the state in the machine is
    // inferred to be "never." (And other cursed inference happens.) Possibly do not use transition
    // names as inference targets? Instead use the names of the BuilderMap. BuilderMap probably
    // doesn't need to be a mapped type, because it's just an extends target: you never pass around
    // raw BuilderMaps, just specific BuilderMaps that extend the base.
    //
    // For now, you can work around these cursed machines by setting the single state as
    // transitioning to itself.
    const MostInner = create.transition<'MostInner', Messages, Props, HiddenParentMessages>().build(
      (state, parent) => state.build({
        messages: {
          next() {
            parent.dispatch("forwardSecond");
          }
        },
      })
    );
    const Inner = create.transition<'Inner', HiddenParentMessages, Props, TopLevelMessages>().build(
      (state, parent) => state.build({
        children: {
          mostInner: create.machine<Messages, Props>().build({
            initial: "MostInner",
            states: { MostInner },
          }),
        },
        messages: {
          forwardSecond() {
            parent.dispatch("second");
          }
        },
      })
    );
    const First = create.transition<"Second", Messages & TopLevelMessages, Props>().build(
      state => state.build({
        children: {
          inner: create.machine<Messages & HiddenParentMessages, Props>().build({
            initial: "Inner",
            states: { Inner },
          }),
        },
        messages: {
          next() {},
          second() {
            state.goto("Second");
          }
        }
      })
    );

    const Second = create.transition().build(state => state.build());

    const machine = create.machine<Messages & TopLevelMessages, Props>().build({
      initial: "First",
      states: { First, Second },
    });

    const mock = machine.events("Second").on("start", vi.fn());
    expect(mock).toHaveBeenCalledTimes(0);
    machine.start({ hello: "world" });
    machine.dispatch("next");
    expect(mock).toHaveBeenCalledOnce();
  });
});
