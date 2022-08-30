/*
 * The state class you need to extend
 * =================================================================================================
 */
export abstract class State<NextState extends string> {
  constructor(protected readonly machine: Machine<StateClassMap<NextState>>) {}
  abstract start(): any;
  abstract stop(): any;
};

/*
 * Type-level definitions
 * =================================================================================================
 */

// A constructor for a state
type StateClass<T extends string> = { new(machine: Machine<any>): State<T> };

// The map of names to state classes you pass into the machine
type StateClassMap<AllTransitions extends string> = {
  [K in AllTransitions]: StateClass<any>;
};

// The end goal of this is the final accessor: a way to figure out what keys need to be in the state
// class map you pass into the machine constructor. Otherwise, the class map won't ensure that your
// map is exhaustive; that is, you could have asked for transitions to states that don't exist in
// the map.
export type NextStateOf<T> = T extends State<infer Next> ? Next : never;
export type StatesOf<SCM extends StateClassMap<any>> = SCM[TransitionsOf<SCM>];
export type LoadPreciseTransitions<SCM extends StateClassMap<any>> = NextStateOf<
  InstanceType<SCM[TransitionsOf<SCM>]>
>;
export type FullySpecifiedStateClassMap<SCM extends StateClassMap<any>> = {
  [K in LoadPreciseTransitions<SCM>]: StateClass<any>;
}

// This is just useful for debugging type inference
export type SCMFrom<M> = M extends Machine<infer A> ? A : never;

// Given a map of names to state classes, this returns a map of names to state instances
type StateMap<Map extends StateClassMap<any>> = {
  [K in keyof Map]: InstanceType<Map[K]>;
};

// Grab the state transition names from either the state class map, or the machine
export type TransitionsOf<M> = M extends StateClassMap<infer T> ? T :
                               M extends Machine<infer A> ? TransitionsOf<A> : never;

/*
 * The machine class that runs and keeps track of states
 * =================================================================================================
 */
export class Machine<Args extends StateClassMap<any>> {
  private stateMap: StateMap<Args>;
  private _current: InstanceType<Args[TransitionsOf<Args>]>;
  private _running = false;

  constructor(initial: keyof Args, args: Args & FullySpecifiedStateClassMap<Args>) {
    const map: Partial<StateMap<Args>> = {};
    for(const transition in args) {
      map[transition as unknown as TransitionsOf<Args>] = new args[transition](this) as any;
    }
    this.stateMap = map as StateMap<Args>;
    this._current = this.stateMap[initial];
  }

  start() {
    this._running = true;
    this._current.start();
  }

  // Given a name, transition to that state
  transition(state: TransitionsOf<Args>) {
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
  current(): InstanceType<Args[TransitionsOf<Args>]> {
    return this._current;
  }

  // Given a name, returns the state
  state<T extends TransitionsOf<Args>>(name: T): StateMap<Args>[T] {
    return this.stateMap[name];
  }
}
