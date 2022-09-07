/*
 * Event system
 * =================================================================================================
 */

type Event = "start" | "stop";
export class EventEmitter {
  private listeners: { [K in Event]: Array<() => any> } = {
    start: [],
    stop: [],
  };

  on(event: Event, cb: () => any) {
    this.listeners[event].push(cb);
    return cb;
  }

  off(event: Event, cb: () => any) {
    const index = this.listeners[event].indexOf(cb);
    if(index < 0) return false;
    this.listeners[event].splice(index, 1);
    return true;
  }

  once(event: Event, cb: () => any) {
    const wrapped = () => {
      cb();
      this.off(event, wrapped);
    };
    return this.on(event, wrapped);
  }

  clear() {
    this.listeners = {
      start: [],
      stop: [],
    };
  }

  emit(event: Event) {
    for(const listener of this.listeners[event]) {
      listener();
    }
  }
}

/*
 * The state class you need to extend
 * =================================================================================================
 */
// Utility type to make defining constructors less of a hassle:
export type ConstructorMachine<NextState extends string> = Machine<StateClassMap<NextState>>;
export type MachineProps = { [key: string]: any }

export abstract class TransitionTo<NextState extends string, Props extends MachineProps = {}> {
  constructor(protected readonly machine: ConstructorMachine<NextState>) { }

  _start(data: Props, emitter: EventEmitter) { this.start(data); emitter.emit("start"); }
  protected start(_: Props) {}
  _stop(data: Props, emitter: EventEmitter) { this.stop(data); emitter.emit("stop"); }
  protected stop(_: Props) {}

  transitionTo(state: keyof StateClassMap<NextState>) {
    this.machine.transitionTo(state);
  }
};

/*
 * Type-level definitions
 * =================================================================================================
 */

// A constructor for a state
type StateClass<T extends string, D extends MachineProps> = {
  new(machine: Machine<any>): TransitionTo<T, D>
};

// The map of names to state classes you pass into the machine
type StateClassMap<AllTransitions extends string> = {
  [K in AllTransitions]: StateClass<any, any>;
};

// The end goal of this is the final accessor: a way to figure out what keys need to be in the state
// class map you pass into the machine constructor. Otherwise, the class map won't ensure that your
// map is exhaustive; that is, you could have asked for transitions to states that don't exist in
// the map.
export type NextStateOf<T> = T extends TransitionTo<infer Next, any> ? Next : never;
export type StatesOf<SCM extends StateClassMap<any>> = SCM[TransitionNamesOf<SCM>];
export type LoadPreciseTransitions<SCM extends StateClassMap<any>> = NextStateOf<
  InstanceType<SCM[TransitionNamesOf<SCM>]>
>;
export type FullySpecifiedStateClassMap<SCM extends StateClassMap<any>> = {
  [K in LoadPreciseTransitions<SCM>]: StateClass<any, any>;
}

// The end goal of this is the final accessor: a way to figure out what data needs to be passed to a
// start() function, given a state class map.
//
// First, we get all of the MachineProps from each state class, and return a map of {[name]: data}
export type MachinePropsByStates<T extends StateClassMap<any>> = {
  [K in keyof T]: T[K] extends StateClass<any, infer Props> ? Props : never;
}
// Next, we get the union of all of the data from that map
export type MachinePropsUnion<T extends { [key: string]: MachineProps }> = T[keyof T];
// This crazy type puts a union type into a contravariant type position, forcing it into an
// intersection type
export type UnionToIntersection<T> =
  (T extends any ? (contra: T) => void : never) extends ((contra: infer I) => void) ? I : never;
// Tie it all together to get the intersection of all machine data from the state class map:
export type MachinePropsFromStateClasses<T extends StateClassMap<any>> = UnionToIntersection<
  MachinePropsUnion<
    MachinePropsByStates<T>
  >
>;

// This is just useful for debugging type inference
export type SCMFrom<M> = M extends Machine<infer A> ? A : never;

// Grab the state transition names from either the state class map, or the machine
export type TransitionNamesOf<M> = M extends StateClassMap<infer T> ? T :
                               M extends Machine<infer A> ? TransitionNamesOf<A> : never;

/*
 * The machine class that runs and keeps track of states
 * =================================================================================================
 */
export class Machine<SCM extends StateClassMap<any>> {
  readonly events: { [K in keyof SCM]: EventEmitter };
  props: MachinePropsFromStateClasses<SCM> | null = null;

  private scm: SCM;
  private _current: InstanceType<SCM[keyof SCM]> | null = null;
  private _running = false;
  private _everRan = false;
  private readonly _initial: keyof SCM;
  private _currentName: keyof SCM;

  constructor(
    input: {
      initial: keyof SCM,
      states: SCM & FullySpecifiedStateClassMap<SCM>,
    }
  ) {
    const args = input.states;
    this._currentName = this._initial = input.initial;
    this.scm = args;

    const eventMap: Partial<{ [K in keyof SCM]: EventEmitter }> = {};
    for(const key in args) {
      eventMap[key as keyof SCM] = new EventEmitter();
    }
    this.events = eventMap as {[K in keyof SCM]: EventEmitter };
  }

  start(props: MachinePropsFromStateClasses<SCM>) {
    if(this._running) return;

    this._everRan = true;
    this._running = true;
    this.props = props;

    this._createAndStart(this._initial);
  }

  // Given a name, transition to that state
  transitionTo(state: keyof SCM) {
    // Boilerplate null safety
    if(!this._everRan) throw new Error("State machine was never started");
    if(!this._running) throw new Error("State machine is stopped");

    // Ignore transitions to the same state
    if(state === this._currentName) return;

    this._stopAndClearCurrent();
    this._createAndStart(state);
  }

  stop() {
    if(!this._running) return;
    this._running = false;
    this._stopAndClearCurrent();
  }

  // This will return true after start has been called, until stop gets called
  running() {
    return this._running;
  }

  // Returns the current state. Useful for calling state-specific methods beyond start/stop
  current(): InstanceType<SCM[keyof SCM]> {
    if(this._current === null) throw new Error("No current state: was the machine ever started?");
    return this._current;
  }

  private _createAndStart(name: keyof SCM) {
    const stateClass = this.scm[name];
    const current = new stateClass(this);
    this._current = current as InstanceType<SCM[keyof SCM]>;
    this._currentName = name;
    current._start(this.props, this.events[name]);
  }

  private _stopAndClearCurrent() {
    if(!this._current) throw new Error("Internal error: _current was never initialized");
    // Stop and clear the old state
    this._current._stop(this.props, this.events[this._currentName]);
  }
}
