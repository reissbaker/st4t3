import { vi, expect, it, describe, beforeEach } from "vitest";
import { TransitionTo, Machine } from "../";

abstract class Base extends TransitionTo<"Bar" | "Foo" | "Final"> {
  start() {}
  stop() {}
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
  start() {}
  stop() {}
  test() {}
  next() {}
  end() {}
}

function machine() {
  return new Machine("Foo", {
    Foo, Bar, Final
  });
}

type MachineType = ReturnType<typeof machine>;
type Should = {
  machine: MachineType,
};

describe("State Machines", () => {
  beforeEach<Should>(ctx => {
    ctx.machine = machine();
  });

  it<Should>("set the current state to the initial transition string", ({ machine }) => {
    expect(machine.current()).toBeInstanceOf(Foo);
  });

  it<Should>("start the current state when started", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "start");
    machine.start();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("stop the current state when stopped", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "stop");
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
    machine.current().next();
    expect(machine.current()).toBeInstanceOf(Bar);
  });

  it<Should>("call stop on states when transitioning off of them", ({ machine }) => {
    const spy = vi.spyOn(machine.current(), "stop");
    machine.current().next();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call start on states when transitioning onto them", ({ machine }) => {
    const spy = vi.spyOn(machine.state("Bar"), "start");
    machine.current().next();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call stop on the old state before calling start on the new state", ({ machine }) => {
    const stopSpy = vi.spyOn(machine.current(), "stop");
    const startSpy = vi.spyOn(machine.state("Bar"), "start").mockImplementation(() => {
      expect(stopSpy).toHaveBeenCalledOnce();
    });
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
});
