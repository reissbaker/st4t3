import { vi, expect, it, describe, beforeEach } from "vitest";
import * as create from "../index";
import { EventEmitter } from "../src/event-emitter";

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

  it<Should>("transition to a duplicate of the current state if force is called", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Foo");

    const spy = machine.currentEvents().on("start", vi.fn());
    machine.force("Foo");
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("remove handlers for a state event when you call clear()", ({ machine }) => {
    const spy = machine.currentEvents().on("start", vi.fn());
    machine.events('Foo').clear();
    machine.start({});
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it<Should>("ignore messages that blank states don't define", ({ machine }) => {
    machine.start({});
    machine.goto("Final");
    expect(() => {
      machine.dispatch("next");
    }).to.not.throw();
  });
});

describe("State machine ultra shorthand syntax", () => {
  const Final = create.transition().build();
  function machine() {
    return create.machine().build({
      initial: "Final",
      states: { Final },
    });
  }
  type MachineType = ReturnType<typeof machine>;

  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>(ctx => {
    ctx.machine = machine();
  });

  it<Should>("create the state", ({ machine }) => {
    const spy = machine.events('Final').on('start', vi.fn());
    machine.start({});
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("State machines using the follow API", () => {
  type EventMapping = {
    skip: void,
  };
  const emitter = new EventEmitter<EventMapping>();

  type Messages = {
    next(): void,
  };
  const Initial = create.transition<"Final" | "Intermediate", Messages>().build(state => {
    state.follow.on(emitter, "skip", () => {
      state.goto("Final");
    });

    return state.build({
      messages: {
        next() {
          state.goto("Intermediate");
        },
      },
    });
  });

  const Intermediate = create.transition<"Final", Messages>().build(state => {
    return state.build({
      messages: {
        next() {
          state.goto("Final");
        },
      },
    });
  });

  const Final = create.transition().build();

  function machine() {
    return create.machine<Messages>().build({
      initial: "Initial",
      states: { Initial, Intermediate, Final },
    });
  }

  type Machine = ReturnType<typeof machine>;

  type Should = {
    machine: Machine,
  };

  beforeEach<Should>(ctx => {
    ctx.machine = machine();
  });

  it<Should>("register to events passed into the follow.on call", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Initial");
    emitter.emit("skip", undefined);
    expect(machine.current()).toStrictEqual("Final");
  });
  it<Should>("deregister events after transition", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Initial");
    machine.dispatch("next");
    expect(machine.current()).toStrictEqual("Intermediate");
    emitter.emit("skip", undefined);
    expect(machine.current()).toStrictEqual("Intermediate");
  });
  it<Should>("deregister events after stop", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Initial");
    machine.stop();
    emitter.emit("skip", undefined);
    expect(machine.current()).toStrictEqual("Initial");
  });
  it<Should>("re-register when the state is started again", ({ machine }) => {
    machine.start({});
    expect(machine.current()).toStrictEqual("Initial");
    machine.stop();
    machine.start({});
    emitter.emit("skip", undefined);
    expect(machine.current()).toStrictEqual("Final");
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
    jumpUpdateDouble(allowed: boolean): void,
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
        jumpUpdateDouble() {},
        land() {
          state.goto('Land');
        },
      }
    });
  });

  const Land = create.transition<'Jump', Messages, Props>().build((state) => {
    return state.build({
      messages: {
        land() {},
        jump() {
          state.goto('Jump');
        },
        jumpUpdateDouble(allowDoubleJumps) {
          state.goto('Jump', { allowDoubleJumps });
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

  it<Should>("allow the props to be updated via goto", ({ machine }) => {
    const spy = vi.fn((props: Props) => {
      expect(props).toStrictEqual({
        allowDoubleJumps: false,
        bounceOnLand: true,
      });
    });
    machine.events('Land').on("start", spy);
    machine.start({
      allowDoubleJumps: false,
      bounceOnLand: true,
    });
    expect(spy).toHaveBeenCalledOnce();

    const jumpSpy = machine.events('Jump').on('start', vi.fn(props => {
      expect(props).toStrictEqual({
        allowDoubleJumps: true,
        bounceOnLand: true,
      });
    }));
    machine.dispatch("jumpUpdateDouble", true);
    expect(jumpSpy).toHaveBeenCalledOnce();
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
      jumpState: s.child<Messages>().build({
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
      landState: s.child().build({
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
        child: s.child().build({
          initial: "MostInner",
          states: { MostInner },
        }),
      },
      messages: {},
    }));

    const Outer = create.transition().build(s => s.build({
      children: {
        child: s.child().build({
          initial: "Inner",
          states: { Inner },
        }),
      },
      messages: {},
    }));

    const MostOuter = create.transition().build(s => s.build({
      children: {
        child: s.child().build({
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

    const MostInner = create.transition<never, Messages, Props, HiddenParentMessages>().build(
      (state, parent) => state.build({
        messages: {
          next() {
            parent.dispatch("forwardSecond");
          }
        },
      })
    );
    const Inner = create.transition<never, HiddenParentMessages, Props, TopLevelMessages>().build(
      (state, parent) => state.build({
        children: {
          mostInner: state.child<Messages, Props>().build({
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
          inner: state.child<Messages & HiddenParentMessages, Props>().build({
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

  it<Should>("allow child machines to have extra props as long as they're static", () => {
    type Props = {
      msg: string,
    };
    type InnerProps = Props & {
      print: boolean,
    };

    const Inner = create.transition<never, {}, InnerProps>().build(state => state.build({
      messages: {}
    }));

    const Outer = create.transition<never, {}, Props>().build(state => state.build({
      children: {
        inner: state.child<{}, InnerProps>().build({
          initial: 'Inner',
          states: { Inner },
          props: {
            print: true,
          },
        }),
      },
      messages: {}
    }));

    const machine = create.machine<{}, Props>().build({
      initial: 'Outer',
      states: { Outer },
    });

    const spy = machine.events('Outer').child('inner').events('Inner').on('start', vi.fn(props => {
      expect(props).toStrictEqual({
        msg: "hello",
        print: true,
      });
    }));

    machine.start({
      msg: "hello",
    });

    expect(spy).toHaveBeenCalledOnce();
  });
});

function testType(cb: () => any) {
  cb();
}

testType(() => {
  // It should throw an error when assigning a not-fully-specified machine
  const NotFinal = create.transition<'Final'>().build(state => state.build());
  create.machine().build({
    initial: 'NotFinal',
    // @ts-expect-error
    states: { NotFinal }
  });
});

testType(() => {
  // It should throw an error if initial is not a name in the map
  const Final = create.transition().build(state => state.build());
  create.machine().build({
    // @ts-expect-error
    initial: 'NotFinal',
    states: { Final },
  });
});

testType(() => {
  // It should throw an error if a state requests a property not offered by the machine
  const Final = create.transition<never, {}, { b: string, a: string }>().build(state => {
    return state.build();
  });

  // Try without static props
  create.machine().build({
    initial: 'Final',
    // @ts-expect-error
    states: { Final },
  });

  // Try with static props
  create.machine().build({
    initial: 'Final',
    // @ts-expect-error
    states: { Final },
    props: {
      a: '',
    }
  });
});

testType(() => {
  // It should throw an error if the child machine is constructed with the wrong parent type
  const Inner = create.transition().build();
  create.transition().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: create.machine().build({
        initial: "Inner",
        states: { Inner },
      }),
    },
    messages: {},
  }));
});

testType(() => {
  // It should throw an error if the child machine is constructed with mismatched argument types
  type ParentMessages = {
    next(a: string): void,
  };
  const Inner = create.transition<never, {}, {}, ParentMessages>().build();

  create.transition<never, { next(a: number): void }>().build(state => {
    return state.build({
      children: {
        inner: state.child().build({
          initial: "Inner",
          // @ts-expect-error
          states: { Inner },
        }),
      },
      messages: {
        next(_: number) {
        }
      },
    })
  });
});

testType(() => {
  // It should throw an error if the child machine is constructed with messages that don't exist
  type ParentMessages = {
    next(a: string): void,
  };
  const Inner = create.transition<never, {}, {}, ParentMessages>().build();

  create.transition<never>().build(state => {
    return state.build({
      children: {
        inner: state.child().build({
          initial: "Inner",
          // @ts-expect-error
          states: { Inner },
        }),
      },
      messages: {},
    })
  });
});

testType(() => {
  // It should be fine to construct a parent type with messages, and have the child ignore them
  const Inner = create.transition().build();

  type ParentMessages = {
    next(a: string): void,
  };
  create.transition<never, ParentMessages>().build(state => state.build({
    children: {
      inner: state.child().build({
        initial: "Inner",
        states: { Inner },
      }),
    },
    messages: {
      next() {}
    },
  }));
});

testType(() => {
  // It should be fine to construct a child type with messages, and have the parent ignore them
  type ChildMessages = {
    next(a: string): void,
  };
  const Inner = create.transition<never, ChildMessages>().build(state => state.build({
    messages: {
      next() {},
    }
  }));

  create.transition().build(state => state.build({
    children: {
      inner: state.child().build({
        initial: "Inner",
        states: { Inner },
      }),
    },
    messages: {
      next() {}
    },
  }));
});

testType(() => {
  // It should be an error to have props that mismatch with the parent props
  type ChildProps = {
    msg: number,
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
      }),
    },
    messages: {},
  }));
});

testType(() => {
  // It should be an error to have props that do not contain the parent props; it would result in
  // invalid start() calls to the child
  type ChildProps = {
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
      }),
    },
    messages: {},
  }));
});

testType(() => {
  // It should be an error to have static props that override the parent props; start() calls should
  // only accept dynamic props, and if you set a static prop and try to pass it in, the compiler
  // should error out
  type Props = {
    msg: string,
  };

  const Inner = create.transition<never, {}, Props>().build();
  create.transition<never, {}, Props>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, Props>().build({
        initial: 'Inner',
        states: { Inner },
        props: {
          msg: "hi",
        },
      }),
    },
    messages: {},
  }));
});

testType(() => {
  // It should be allowed to have child props that are larger than the parent props, if all the
  // extra props are passed in as static props
  type ChildProps = {
    msg: string,
    print: boolean,
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
        props: {
          print: true,
        },
      }),
    },
    messages: {},
  }));
});

testType(() => {
  // It should be an error to have child props that are larger than the parent props, if those props
  // are not set as static props in the machine constructor (because otherwise they will never get
  // set).
  type ChildProps = {
    msg: string,
    print: boolean,
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
      }),
    },
    messages: {},
  }));
});
