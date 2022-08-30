"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Machine = exports.TransitionTo = void 0;
/*
 * The state class you need to extend
 * =================================================================================================
 */
class TransitionTo {
    constructor(machine) {
        this.machine = machine;
    }
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
    constructor(initial, args) {
        this._running = false;
        const map = {};
        for (const transition in args) {
            map[transition] = new args[transition](this);
        }
        this.stateMap = map;
        this._current = this.stateMap[initial];
    }
    start() {
        this._running = true;
        this._current.start();
    }
    // Given a name, transition to that state
    transition(state) {
        this._current.stop();
        this._current = this.stateMap[state];
        this._current.start();
    }
    stop() {
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
