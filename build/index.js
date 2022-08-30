"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Machine = exports.State = void 0;
class State {
    constructor(machine) {
        this.machine = machine;
    }
}
exports.State = State;
;
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
    transition(state) {
        this._current.stop();
        this._current = this.stateMap[state];
        this._current.start();
    }
    stop() {
        this._running = false;
        this._current.stop();
    }
    running() {
        return this._running;
    }
    current() {
        return this._current;
    }
    state(name) {
        return this.stateMap[name];
    }
}
exports.Machine = Machine;
