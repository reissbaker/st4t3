"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const __1 = require("../");
class Base extends __1.TransitionTo {
    test() { }
}
class Foo extends Base {
    next() {
        this.transition("Bar");
    }
    end() {
        this.transition("Final");
    }
    foo() { }
}
class Bar extends Base {
    next() {
        this.transition("Foo");
    }
    end() {
        this.transition("Final");
    }
}
class Final extends __1.TransitionTo {
    test() { }
    next() { }
    end() { }
}
function machine() {
    return new __1.Machine("Foo", {
        Foo, Bar, Final
    });
}
(0, vitest_1.describe)("State Machines", () => {
    (0, vitest_1.beforeEach)(ctx => {
        ctx.machine = machine();
    });
    (0, vitest_1.it)("set the current state to the initial transition string", ({ machine }) => {
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Foo);
    });
    (0, vitest_1.it)("start the current state when started", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "start");
        machine.start();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("stop the current state when stopped", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "stop");
        machine.start();
        machine.stop();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("allow accessing methods on #current() that all states define", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "test");
        machine.current().test();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("allow transitions between states", ({ machine }) => {
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Foo);
        machine.start();
        machine.current().next();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
    });
    (0, vitest_1.it)("call stop on states when transitioning off of them", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "stop");
        machine.start();
        machine.current().next();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("call start on states when transitioning onto them", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.state("Bar"), "start");
        machine.start();
        machine.current().next();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("call stop on the old state before calling start on the new state", ({ machine }) => {
        const stopSpy = vitest_1.vi.spyOn(machine.current(), "stop");
        const startSpy = vitest_1.vi.spyOn(machine.state("Bar"), "start").mockImplementation(() => {
            (0, vitest_1.expect)(stopSpy).toHaveBeenCalledOnce();
        });
        machine.start();
        machine.current().next();
        (0, vitest_1.expect)(startSpy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("say it's running after being started", ({ machine }) => {
        (0, vitest_1.expect)(machine.running()).toEqual(false);
        machine.start();
        (0, vitest_1.expect)(machine.running()).toEqual(true);
    });
    (0, vitest_1.it)("say it's not running after being stopped", ({ machine }) => {
        machine.start();
        machine.stop();
        (0, vitest_1.expect)(machine.running()).toEqual(false);
    });
    (0, vitest_1.it)("allow calling state-specific functions when accessing states", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.state("Foo"), "foo");
        machine.state("Foo").foo();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("reset to the initial state after a new start call", ({ machine }) => {
        machine.start();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Foo);
        machine.current().next();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
        machine.stop();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
        machine.start();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Foo);
    });
    (0, vitest_1.it)("not reset on multiple start calls in a row", ({ machine }) => {
        machine.start();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Foo);
        machine.current().next();
        machine.start();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
    });
    (0, vitest_1.it)("only call start() on states once for repeated start invocations", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "start");
        machine.start();
        machine.start();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("only call stop() on states once for repeated stop invocations", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "stop");
        machine.start();
        machine.stop();
        machine.stop();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("not call stop() on states unless it already started", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "stop");
        machine.stop();
        (0, vitest_1.expect)(spy).toHaveBeenCalledTimes(0);
    });
    (0, vitest_1.it)("call start again if stop has been called in between invocations", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "start");
        machine.start();
        machine.stop();
        machine.start();
        (0, vitest_1.expect)(spy).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)("call stop again if start has been called in between invocations", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "stop");
        machine.start();
        machine.stop();
        machine.start();
        machine.stop();
        (0, vitest_1.expect)(spy).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)("not reset to the starting state if reset is false", ({ machine }) => {
        machine.start();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Foo);
        machine.current().next();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
        machine.stop();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
        machine.start({ reset: false });
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
    });
    (0, vitest_1.it)("throw a useful error upon transition if it was never started", ({ machine }) => {
        (0, vitest_1.expect)(() => machine.current().next()).toThrowError("State machine was never started");
    });
    (0, vitest_1.it)("throw a useful error upon transition if it was stopped", ({ machine }) => {
        machine.start();
        machine.stop();
        (0, vitest_1.expect)(() => machine.current().next()).toThrowError("State machine is stopped");
    });
});
