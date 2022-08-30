import { vi, expect, it, describe, beforeEach } from "vitest";
import { State, Machine } from "../";

class Foo extends State<"bar"|"final"> {
  start() {}
  stop() {}
  test() {}
  next() {
    this.machine.transition("bar");
  }
  end() {
    this.machine.transition("final");
  }
}

class Bar extends State<"foo"|"final"> {
  start() {}
  stop() {}
  test() {}
  next() {
    this.machine.transition("foo");
  }
  end() {
    this.machine.transition("final");
  }
}

class Final extends State<never> {
  start() {}
  stop() {}
  test() {}
  next() {}
  end() {}
}

function machine() {
  return new Machine("foo", {
    foo: Foo,
    bar: Bar,
    final: Final,
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
    const spy = vi.spyOn(machine.state("bar"), "start");
    machine.current().next();
    expect(spy).toHaveBeenCalledOnce();
  });

  it<Should>("call stop on the old state before calling start on the new state", ({ machine }) => {
    const stopSpy = vi.spyOn(machine.current(), "stop");
    const startSpy = vi.spyOn(machine.state("bar"), "start").mockImplementation(() => {
      expect(stopSpy).toHaveBeenCalledOnce();
    });
    machine.current().next();
    expect(startSpy).toHaveBeenCalledOnce();
  });
});
