/*
 * Event system
 * =================================================================================================
 */

type Event = "start" | "stop";
export class EventEmitter {
  private readonly listeners: { [K in Event]: Array<() => any> } = {
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

  protected emit(event: Event) {
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
export type MachineData = { [key: string]: any }

export abstract class TransitionTo<NextState extends string, Data extends MachineData = {}> extends EventEmitter {
  constructor(protected readonly machine: ConstructorMachine<NextState>) { super(); }

  _start(data: Data) { this.start(data); this.emit("start"); }
  protected start(_: Data) {}
  _stop() { this.stop(); this.emit("stop"); }
  protected stop() {}

  transition(state: TransitionNamesOf<StateClassMap<NextState>>) {
    this.machine.transition(state);
  }
};

/*
 * Type-level definitions
 * =================================================================================================
 */

// A constructor for a state
type StateClass<T extends string, D extends MachineData> = {
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
// First, we get all of the MachineData from each state class, and return a map of {[name]: data}
export type MachineDataByStates<T extends StateClassMap<any>> = {
  [K in keyof T]: T[K] extends StateClass<any, infer Data> ? Data : never;
}
// Next, we get the union of all of the data from that map
export type MachineDataUnion<T extends { [key: string]: MachineData }> = T[keyof T];
// This crazy type puts a union type into a contravariant type position, forcing it into an
// intersection type
export type UnionToIntersection<T> =
  (T extends any ? (contra: T) => void : never) extends ((contra: infer I) => void) ? I : never;
// Tie it all together to get the intersection of all machine data from the state class map:
export type MachineDataFromStateClasses<T extends StateClassMap<any>> = UnionToIntersection<
  MachineDataUnion<
    MachineDataByStates<T>
  >
>;

// This is just useful for debugging type inference
export type SCMFrom<M> = M extends Machine<infer A> ? A : never;

// Given a map of names to state classes, this returns a map of names to state instances
type StateMap<Map extends StateClassMap<any>> = {
  [K in keyof Map]: InstanceType<Map[K]>;
};

// Grab the state transition names from either the state class map, or the machine
export type TransitionNamesOf<M> = M extends StateClassMap<infer T> ? T :
                               M extends Machine<infer A> ? TransitionNamesOf<A> : never;

/*
 * The machine class that runs and keeps track of states
 * =================================================================================================
 */
export class Machine<Args extends StateClassMap<any>> {
  private stateMap: StateMap<Args>;
  private _current: InstanceType<Args[TransitionNamesOf<Args>]>;
  private _running = false;
  private _everRan = false;

  constructor(
    private readonly _initial: keyof Args,
    readonly machineData: MachineDataFromStateClasses<Args>,
    args: Args & FullySpecifiedStateClassMap<Args>
  ) {
    const map: Partial<StateMap<Args>> = {};
    for(const transition in args) {
      map[transition as unknown as TransitionNamesOf<Args>] = new args[transition](this) as any;
    }
    this.stateMap = map as StateMap<Args>;
    this._current = this.stateMap[_initial];
  }

  start(args = {reset: true}) {
    if(this._running) return;

    this._everRan = true;
    this._running = true;

    if(args.reset) this._current = this.stateMap[this._initial];
    this._current._start(this.machineData);
  }

  // Given a name, transition to that state
  transition(state: TransitionNamesOf<Args>) {
    if(!this._everRan) throw new Error("State machine was never started");
    if(!this._running) throw new Error("State machine is stopped");

    this._current._stop();
    this._current = this.stateMap[state];
    this._current._start(this.machineData);
  }

  stop() {
    if(!this._running) return;

    this._running = false;
    this._current._stop();
  }

  // This will return true after start has been called, until stop gets called
  running() {
    return this._running;
  }

  // Returns the current state. Useful for calling state-specific methods beyond start/stop
  current(): InstanceType<Args[TransitionNamesOf<Args>]> {
    return this._current;
  }

  // Given a name, returns the state
  state<T extends TransitionNamesOf<Args>>(name: T): StateMap<Args>[T] {
    return this.stateMap[name];
  }
}
