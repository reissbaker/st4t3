import { vi, expect, it, describe, beforeEach } from "vitest";
import { TransitionTo, Machine } from "../";

abstract class Base extends TransitionTo<"Bar" | "Foo" | "Final"> {
  test() {}
}

class Foo extends Base {
  next() {
    this.transition("Bar");
  }
  end() {
    this.transition("Final");
  }
  foo() {}
}

class Bar extends Base {
  next() {
    this.transition("Foo");
  }
  end() {
    this.transition("Final");
  }
}

class Final extends TransitionTo<never> {
  test() {}
  next() {}
  end() {}
}

function machine() {
  return new Machine("Foo", {}, {
    Foo, Bar, Final
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

  it<Should>("set the current state to the initial transition string", ({ machine }) => {
    expect(machine.current()).toBeInstanceOf(Foo);
  });

  it<Should>("start the current state when started", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_start");
    machine.start();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("stop the current state when stopped", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_stop");
    machine.start();
    machine.stop();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("allow accessing methods on #current() that all states define", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "test");
    machine.current().test();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("allow transitions between states", ({ machine }) => {
    expect(machine.current()).toBeInstanceOf(Foo);
    machine.start();
    machine.current().next();
    expect(machine.current()).toBeInstanceOf(Bar);
  });

  it<Should>("call stop on states when transitioning off of them", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_stop");
    machine.start();
    machine.current().next();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call start on states when transitioning onto them", ({ machine }) => {
    const spy = vi.spyOn(machine.state("Bar"), "_start");
    machine.start();
    machine.current().next();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call stop on the old state before calling start on the new state", ({ machine }) => {
    const stopSpy = vi.spyOn(machine.current(), "_stop");
    const startSpy = vi.spyOn(machine.state("Bar"), "_start").mockImplementation(() => {
      expect(stopSpy).toHaveBeenCalledOnce();
    });
    machine.start();
    machine.current().next();
    expect(startSpy).toHaveBeenCalledOnce();
  });

  it<Should>("say it's running after being started", ({ machine }) => {
    expect(machine.running()).toEqual(false);
    machine.start();
    expect(machine.running()).toEqual(true);
  });

  it<Should>("say it's not running after being stopped", ({ machine }) => {
    machine.start();
    machine.stop();
    expect(machine.running()).toEqual(false);
  });

  it<Should>("allow calling state-specific functions when accessing states", ({ machine }) => {
    const spy = vi.spyOn(machine.state("Foo"), "foo");
    machine.state("Foo").foo();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("reset to the initial state after a new start call", ({ machine }) => {
    machine.start();
    expect(machine.current()).toBeInstanceOf(Foo);
    machine.current().next();
    expect(machine.current()).toBeInstanceOf(Bar);
    machine.stop();
    expect(machine.current()).toBeInstanceOf(Bar);
    machine.start();
    expect(machine.current()).toBeInstanceOf(Foo);
  });

  it<Should>("not reset on multiple start calls in a row", ({ machine }) => {
    machine.start();
    expect(machine.current()).toBeInstanceOf(Foo);
    machine.current().next();
    machine.start();
    expect(machine.current()).toBeInstanceOf(Bar);
  });

  it<Should>("only call start() on states once for repeated start invocations", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_start");
    machine.start();
    machine.start();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("only call stop() on states once for repeated stop invocations", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_stop");
    machine.start();
    machine.stop();
    machine.stop();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("not call stop() on states unless it already started", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_stop");
    machine.stop();
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it<Should>("call start again if stop has been called in between invocations", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_start");
    machine.start();
    machine.stop();
    machine.start();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it<Should>("call stop again if start has been called in between invocations", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_stop");
    machine.start();
    machine.stop();
    machine.start();
    machine.stop();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it<Should>("not reset to the starting state if reset is false", ({ machine }) => {
    machine.start();
    expect(machine.current()).toBeInstanceOf(Foo);
    machine.current().next();
    expect(machine.current()).toBeInstanceOf(Bar);
    machine.stop();
    expect(machine.current()).toBeInstanceOf(Bar);
    machine.start({ reset: false });
    expect(machine.current()).toBeInstanceOf(Bar);
  });

  it<Should>("throw a useful error upon transition if it was never started", ({ machine }) => {
    expect(() => machine.current().next()).toThrowError("State machine was never started");
  });

  it<Should>("throw a useful error upon transition if it was stopped", ({ machine }) => {
    machine.start();
    machine.stop();
    expect(() => machine.current().next()).toThrowError("State machine is stopped");
  });

  it<Should>("cause the state to emit a start event when starting", ({ machine }) => {
    let called = false;
    machine.current().on("start", () => {
      called = true;
    });
    machine.start();
    expect(called).toEqual(true);
  });

  it<Should>("cause the state to emit a start event when transitioning in", ({ machine }) => {
    let called = false;
    machine.state("Final").on("start", () => {
      called = true;
    });
    machine.start();
    expect(called).toEqual(false);
    machine.current().end();
    expect(called).toEqual(true);
  });

  it<Should>("cause the state to emit a stop event when stopping", ({ machine }) => {
    let called = false;
    machine.current().on("stop", () => {
      called = true;
    });
    machine.start();
    expect(called).toEqual(false);
    machine.stop();
    expect(called).toEqual(true);
  });

  it<Should>("cause the state to emit a stop event when transitioning out", ({ machine }) => {
    let called = false;
    machine.current().on("stop", () => {
      called = true;
    });
    machine.start();
    expect(called).toEqual(false);
    machine.current().next();
    expect(called).toEqual(true);
  });

  it<Should>("cause the state to emit start events every time start is called", ({ machine }) => {
    let called = 0;
    machine.current().on("start", () => called++);
    machine.start();
    machine.stop();
    machine.start();
    expect(called).toEqual(2);
  });

  it<Should>("unregister once() listeners after the first invocation", ({ machine }) => {
    let called = 0;
    machine.current().once("start", () => called++);
    machine.start();
    machine.stop();
    machine.start();
    expect(called).toEqual(1);
  });

  it<Should>("unregister listeners when off() is called", ({ machine }) => {
    let called = 0;
    const cb = machine.current().on("start", () => called++);
    machine.start();
    machine.current().off("start", cb);
    machine.stop();
    machine.start();
    expect(called).toEqual(1);
  });

  it<Should>("return false from off() if the listener isn't registered", ({ machine }) => {
    let called = 0;
    const cb = machine.current().on("start", () => called++);
    machine.start();
    machine.current().off("start", cb);
    machine.stop();
    machine.start();
    expect(called).toEqual(1);
    expect(machine.current().off("start", cb)).toEqual(false);
  });
});

class Jump extends TransitionTo<'Land', { allowDoubleJumps: boolean }> {
  jump() {}
  land() {
    this.transition('Land');
  }
}

class Land extends TransitionTo<'Jump', { bounceOnLand: boolean }> {
  land() {}
  jump() {
    this.transition('Jump');
  }
}

function jumpMachine() {
  return new Machine('Land', { allowDoubleJumps: false, bounceOnLand: true }, {
    Jump, Land
  });
}

describe("State machines with initial state args", () => {
  type MachineType = ReturnType<typeof jumpMachine>;
  type Should = {
    machine: MachineType,
  };

  beforeEach<Should>((ctx) => {
    ctx.machine = jumpMachine();
  });

  it<Should>("pass the initial state args into the state on start()", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_start");
    machine.start();
    expect(spy).toHaveBeenCalledWith(machine.machineData);
  });

  it<Should>("continue passing the state args into start() calls on transition", ({ machine }) => {
    const spy = vi.spyOn(machine.state("Jump"), "_start");
    machine.start();
    expect(spy).toHaveBeenCalledTimes(0);
    machine.current().jump();
    expect(spy).toHaveBeenCalledWith(machine.machineData);
  });

  it<Should>("pass the state args into subsequent start() calls after a stop", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "_start");
    machine.start();
    expect(spy).toHaveBeenCalledWith(machine.machineData);
    machine.stop();
    machine.start();
    expect(spy).toHaveBeenNthCalledWith(2, machine.machineData);
    machine.stop();
    machine.start();
    expect(spy).toHaveBeenNthCalledWith(3, machine.machineData);
  });
});
