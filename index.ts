/*
 * The state class you need to extend
 * =================================================================================================
 */
// Utility type to make defining constructors less of a hassle:
export type ConstructorMachine<NextState extends string> = Machine<StateClassMap<NextState>>;

export abstract class TransitionTo<NextState extends string> {
  constructor(protected readonly machine: ConstructorMachine<NextState>) {}
  start() {}
  stop() {}
  transition(state: TransitionNamesOf<StateClassMap<NextState>>) {
    this.machine.transition(state);
  }
};

/*
 * Type-level definitions
 * =================================================================================================
 */

// A constructor for a state
type StateClass<T extends string> = { new(machine: Machine<any>): TransitionTo<T> };

// The map of names to state classes you pass into the machine
type StateClassMap<AllTransitions extends string> = {
  [K in AllTransitions]: StateClass<any>;
};

// The end goal of this is the final accessor: a way to figure out what keys need to be in the state
// class map you pass into the machine constructor. Otherwise, the class map won't ensure that your
// map is exhaustive; that is, you could have asked for transitions to states that don't exist in
// the map.
export type NextStateOf<T> = T extends TransitionTo<infer Next> ? Next : never;
export type StatesOf<SCM extends StateClassMap<any>> = SCM[TransitionNamesOf<SCM>];
export type LoadPreciseTransitions<SCM extends StateClassMap<any>> = NextStateOf<
  InstanceType<SCM[TransitionNamesOf<SCM>]>
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
    this._current.start();
  }

  // Given a name, transition to that state
  transition(state: TransitionNamesOf<Args>) {
    if(!this._everRan) throw new Error("State machine was never started");
    if(!this._running) throw new Error("State machine is stopped");

    this._current.stop();
    this._current = this.stateMap[state];
    this._current.start();
  }

  stop() {
    if(!this._running) return;

    this._running = false;
    this._current.stop();
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
