import { EventEmitter } from "./src/event-emitter";
export { EventEmitter };

/*
 * The state class you need to extend
 * =================================================================================================
 */

// Utility types to make defining state class constructors less of a hassle:
export type ConstructorMachine<NextState extends string> = Machine<StateClassMap<NextState>, any>;
export type MachineProps = { [key: string]: any }

// Event emitters for states
export type StateEvents<S extends TransitionTo<any, any>> = {
  start: S,
  stop: S,
};
export type StateEventEmitter<S extends TransitionTo<any, any>> = EventEmitter<StateEvents<S>>

type RemoveParent<Props extends MachineProps> = {
  [K in Exclude<keyof Props, 'parent'>]: Props[K];
};

export type ChildMachine<NextState extends string, Props extends MachineProps> =
  Machine<any, RemoveParent<Props> & ({ parent: TransitionTo<NextState, Props> } | {})>;

export type MachineChildren<NextState extends string, Props extends MachineProps> = {
  [key: string]: ChildMachine<NextState, Props>
};

// The class to extend
export abstract class TransitionTo<NextState extends string, Props extends MachineProps = {}> {
  readonly children?: MachineChildren<NextState, Props>;

  constructor(
    protected readonly machine: ConstructorMachine<NextState>,
    readonly props: Props,
  ) { }

  // For some reason, TSC freaks out if you use StateEventEmitter<this> even though it should be
  // able to infer all the way down. Whatever, just use any here; the Machine class makes sure it's
  // the right emitter.
  _start(emitter: StateEventEmitter<any>) {
    this.start();
    if(this.children) {
      for(const key in this.children) {
        const child = this.children[key];
        child.start({
          ...this.props,
          parent: this,
        });
      }
    }
    emitter.emit("start", this);
  }
  protected start() {}

  // Ditto
  _stop(emitter: StateEventEmitter<any>) {
    this.stop();
    if(this.children) {
      for(const key in this.children) {
        const child = this.children[key];
        child.stop();
      }
    }
    emitter.emit("stop", this);
  }
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
export type StateClass<T extends string, D extends MachineProps> = {
  new(machine: Machine<any, any>, props: D): TransitionTo<T, D>
};

// The map of names to state classes you pass into the machine
export type StateClassMap<AllTransitions extends string> = {
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
export type Contravariant<T> =
  (T extends any ? (contra: T) => void : never) extends ((contra: infer I) => void) ? I : never;
// Tie it all together to get the intersection of all machine data from the state class map:
export type MachinePropsFromStateClasses<T extends StateClassMap<any>> = Contravariant<
  MachinePropsUnion<
    MachinePropsByStates<T>
  >
>;

// This is useful for generating child event names, and debugging type inference
export type SCMFrom<M> = M extends Machine<infer A, any> ? A : never;

// Grab the state transition names from either the state class map, or the machine
export type TransitionNamesOf<M> = M extends StateClassMap<infer T> ? T :
                               M extends Machine<infer A, any> ? TransitionNamesOf<A> : never;

// Utility type to easily express the events for a given state class map
export type EventsForStates<SCM extends StateClassMap<any>> = {
  [K in keyof SCM]: StateEventEmitter<InstanceType<SCM[K]>>
};

/*
 * Flyweights to call events and child events on, even when the underlying states and child machines
 * don't exist.
 * =================================================================================================
 */

export type AllChildMachineNames<State extends TransitionTo<any, any>> = keyof State['children'];

export type ChildMachineName<Name extends string, State extends TransitionTo<any, any>> =
  Name extends AllChildMachineNames<State> ? Name : never;

export type NamedChildMachine<Name extends string, State extends TransitionTo<any, any>> =
  Name extends AllChildMachineNames<State> ? (
    State['children'][Name] extends Machine<any, any> ? State['children'][Name] : never
  ): never;

export class MachineFlyweight<M extends Machine<any, any>> {
  readonly _stateMap: FlyweightStateMap<SCMFrom<M>> = {};

  events<Name extends keyof SCMFrom<M>>(name: string & Name): StateFlyweight<InstanceType<SCMFrom<M>[Name]>> {
    const cachedState = this._stateMap[name];
    if(cachedState) return cachedState;

    const state = new StateFlyweight();
    this._stateMap[name] = state;
    return state;
  }
}

export class StateFlyweight<
  State extends TransitionTo<any, any>
> extends EventEmitter<StateEvents<State>> {
  readonly _machineMap: FlyweightMachineMap<State> = {};

  child<Name extends AllChildMachineNames<State> & string>(
    name: Name
  ): MachineFlyweight<NamedChildMachine<Name, State>> {
    const cachedMachine = this._machineMap[name];
    if(cachedMachine) return cachedMachine;

    const machine = new MachineFlyweight();
    this._machineMap[name] = machine;
    return machine;
  }
}

type FlyweightStateMap<SCM extends StateClassMap<any>> = {
  [K in keyof SCM]?: StateFlyweight<InstanceType<SCM[K]>>
};
type FlyweightMachineMap<State extends TransitionTo<any, any>> = {
  [K in AllChildMachineNames<State>]?: MachineFlyweight<any>
};

/*
 * The machine class that runs and keeps track of states
 * =================================================================================================
 */
export class Machine<SCM extends StateClassMap<any>, Props extends MachinePropsFromStateClasses<SCM>> {
  props: Props | null = null;

  private scm: SCM;
  private _events: FlyweightStateMap<SCM> = {};
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
  }

  start(props: Props) {
    if(this._running) return;

    this._everRan = true;
    this._running = true;
    this.props = props;

    this._createAndStart(this._initial, props);
  }

  hydrate(flyweight: MachineFlyweight<this>) {
    this._events = flyweight._stateMap;
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
  currentEvents(): StateFlyweight<InstanceType<SCM[keyof SCM]>> {
    return this.events(this._currentName);
  }

  // Returns the event emitter for the named state. The emitter is technically a StateFlyweight,
  // which allows you to call .child('machineName') to get an event register for the named
  // child machine; for example:
  // `machine.events('StateName').child('nestedChild').events('NestedState').on(...)`
  events<Name extends keyof SCM>(name: Name): StateFlyweight<InstanceType<SCM[Name]>> {
    const cachedState = this._events[name];
    if(cachedState) return cachedState;

    const state = new StateFlyweight();
    this._events[name] = state;
    return state;
  }

  private _createAndStart<N extends keyof SCM>(name: N, props: MachinePropsFromStateClasses<SCM>) {
    const stateClass = this.scm[name];
    const current = new stateClass(this, props) as InstanceType<SCM[N]>;
    this._current = current as InstanceType<SCM[keyof SCM]>;
    this._currentName = name;

    // Hydrate any newly-created machines from the corresponding flyweights
    if(current.children) {
      for(const key in current.children) {
        const machineMap = this.currentEvents()._machineMap as { [key: string]: MachineFlyweight<any> };
        if(machineMap[key]) current.children[key].hydrate(machineMap[key]);
      }
    }

    current._start(this.events(name));
  }

  private _stopCurrent() {
    if(!this._current) throw new Error("Internal error: _current was never initialized");
    // Stop and clear the old state
    this._current._stop(this.events(this._currentName));
  }
}
