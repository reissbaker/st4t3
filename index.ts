/*
 * Event system
 * =================================================================================================
 *
 * A typed, generic event system, supporting a stripped-down version of the NodeJS EventEmitter API.
 *
 * You must tell the type system ahead of time what events you plan on emitting, and what data the
 * callbacks for those events take.
 */

type EventNameToDataMapping = { [key: string]: any };
export class EventEmitter<Mapping extends EventNameToDataMapping> {
  private listeners: Partial<{ [K in keyof Mapping]: Array<(input: Mapping[K]) => any> }> = {};

  // Register a callback for an event
  on<K extends keyof Mapping>(event: K, cb: (input: Mapping[K]) => any) {
    this.ensureKeyExists(event).push(cb);
    return cb;
  }

  // Unregister a callback for an event. Returns true if it was unregistered, false if it was never
  // registered in the first place
  off<K extends keyof Mapping>(event: K, cb: (input: Mapping[K]) => any) {
    const listeners = this.ensureKeyExists(event);
    const index = listeners.indexOf(cb);
    if(index < 0) return false;
    listeners.splice(index, 1);
    return true;
  }

  // Register a callback that runs a single time before unregistering itself
  once<K extends keyof Mapping>(event: K, cb: (input: Mapping[K]) => any) {
    const wrapped = (input: Mapping[K]) => {
      cb(input);
      this.off(event, wrapped);
    };
    return this.on(event, wrapped);
  }

  // Remove all callbacks from this EventEmitter
  clear() {
    for(const key in this.listeners) {
      this.listeners[key] = [];
    }
  }

  // Emit an event
  emit<Ev extends keyof Mapping>(event: Ev, data: Mapping[Ev]) {
    for(const listener of this.ensureKeyExists(event)) {
      listener(data);
    }
  }

  // Utility function to ensure that keys always translate to callback arrays
  private ensureKeyExists<K extends keyof Mapping>(k: K): Array<(input: Mapping[K]) => any> {
    let listeners = this.listeners[k];
    if(!listeners) {
      listeners = [];
      this.listeners[k] = listeners;
    }
    return listeners;
  }
}

/*
 * The state class you need to extend
 * =================================================================================================
 */

// Utility types to make defining state class constructors less of a hassle:
export type ConstructorMachine<NextState extends string> = Machine<StateClassMap<NextState>>;
export type MachineProps = { [key: string]: any }

// Event emitters for states
export type StateEventEmitter<S extends TransitionTo<any, any>> = EventEmitter<{
  start: S,
  stop: S,
}>

// The class to extend
export abstract class TransitionTo<NextState extends string, Props extends MachineProps = {}> {
  constructor(
    protected readonly machine: ConstructorMachine<NextState>,
    readonly props: Props,
  ) { }

  _start(emitter: StateEventEmitter<this>) { this.start(); emitter.emit("start", this); }
  protected start() {}
  _stop(emitter: StateEventEmitter<this>) { this.stop(); emitter.emit("stop", this); }
  protected stop() {}

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
  new(machine: Machine<any>, props: D): TransitionTo<T, D>
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

// Utility type to easily express the events for a given state class map
export type EventsForStates<SCM extends StateClassMap<any>> = {
  [K in keyof SCM]: StateEventEmitter<InstanceType<SCM[K]>>
};

/*
 * The machine class that runs and keeps track of states
 * =================================================================================================
 */
export class Machine<SCM extends StateClassMap<any>> {
  readonly events: EventsForStates<SCM>;
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

    const eventMap: Partial<EventsForStates<SCM>> = {};
    for(const key in args) {
      eventMap[key as keyof SCM] = new EventEmitter();
    }
    this.events = eventMap as EventsForStates<SCM>;
  }

  start(props: MachinePropsFromStateClasses<SCM>) {
    if(this._running) return;

    this._everRan = true;
    this._running = true;
    this.props = props;

    this._createAndStart(this._initial, props);
  }

  // Given a name, transition to that state
  transitionTo(state: keyof SCM) {
    // Boilerplate null safety
    if(!this._everRan) throw new Error("State machine was never started");
    if(!this._running) throw new Error("State machine is stopped");

    // Ignore transitions to the same state
    if(state === this._currentName) return;

    this._stopCurrent();
    // If we've gotten this far, we know that the machine has been started and can assume this.props
    // is either non-null, or is intended to be null (all states expect null). Force cast and go
    this._createAndStart(state, this.props as unknown as MachinePropsFromStateClasses<SCM>);
  }

  stop() {
    if(!this._running) return;
    this._running = false;
    this._stopCurrent();
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

  // Returns the event emitter for whatever the current state is (or the initial state, if the
  // machine hasn't started yet). Mostly useful for tests.
  currentEvents(): StateEventEmitter<InstanceType<SCM[keyof SCM]>> {
    return this.events[this._currentName];
  }

  private _createAndStart<N extends keyof SCM>(name: N, props: MachinePropsFromStateClasses<SCM>) {
    const stateClass = this.scm[name];
    const current = new stateClass(this, props) as InstanceType<SCM[N]>;
    this._current = current as InstanceType<SCM[keyof SCM]>;
    this._currentName = name;
    current._start(this.events[name]);
  }

  private _stopCurrent() {
    if(!this._current) throw new Error("Internal error: _current was never initialized");
    // Stop and clear the old state
    this._current._stop(this.events[this._currentName]);
  }
}
