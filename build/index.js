"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Machine = exports.TransitionTo = void 0;
class TransitionTo {
    constructor(machine) {
        this.machine = machine;
    }
    start() { }
    stop() { }
    transition(state) {
        this.machine.transition(state);
    }
}
exports.TransitionTo = TransitionTo;
;
/*
 * The machine class that runs and keeps track of states
 * =================================================================================================
 */
class Machine {
    constructor(_initial, args) {
        this._initial = _initial;
        this._running = false;
        this._everRan = false;
        const map = {};
        for (const transition in args) {
            map[transition] = new args[transition](this);
        }
        this.stateMap = map;
        this._current = this.stateMap[_initial];
    }
    start(args = { reset: true }) {
        if (this._running)
            return;
        this._everRan = true;
        this._running = true;
        if (args.reset)
            this._current = this.stateMap[this._initial];
        this._current.start();
    }
    // Given a name, transition to that state
    transition(state) {
        if (!this._everRan)
            throw new Error("State machine was never started");
        if (!this._running)
            throw new Error("State machine is stopped");
        this._current.stop();
        this._current = this.stateMap[state];
        this._current.start();
    }
    stop() {
        if (!this._running)
            return;
        this._running = false;
        this._current.stop();
    }
    // This will return true after start has been called, until stop gets called
    running() {
        return this._running;
    }
    // Returns the current state. Useful for calling state-specific methods beyond start/stop
    current() {
        return this._current;
    }
    // Given a name, returns the state
    state(name) {
        return this.stateMap[name];
    }
}
exports.Machine = Machine;
