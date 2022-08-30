"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const __1 = require("../");
class Base extends __1.State {
    start() { }
    stop() { }
    test() { }
}
class Foo extends Base {
    next() {
        this.machine.transition("bar");
    }
    end() {
        this.machine.transition("final");
    }
    foo() { }
}
class Bar extends Base {
    next() {
        this.machine.transition("foo");
    }
    end() {
        this.machine.transition("final");
    }
}
class Final extends __1.State {
    start() { }
    stop() { }
    test() { }
    next() { }
    end() { }
}
function machine() {
    return new __1.Machine("foo", {
        foo: Foo,
        bar: Bar,
        final: Final,
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
        machine.current().next();
        (0, vitest_1.expect)(machine.current()).toBeInstanceOf(Bar);
    });
    (0, vitest_1.it)("call stop on states when transitioning off of them", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.current(), "stop");
        machine.current().next();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("call start on states when transitioning onto them", ({ machine }) => {
        const spy = vitest_1.vi.spyOn(machine.state("bar"), "start");
        machine.current().next();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)("call stop on the old state before calling start on the new state", ({ machine }) => {
        const stopSpy = vitest_1.vi.spyOn(machine.current(), "stop");
        const startSpy = vitest_1.vi.spyOn(machine.state("bar"), "start").mockImplementation(() => {
            (0, vitest_1.expect)(stopSpy).toHaveBeenCalledOnce();
        });
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
        const spy = vitest_1.vi.spyOn(machine.state("foo"), "foo");
        machine.state("foo").foo();
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
});
