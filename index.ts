export abstract class State<NextState extends string> {
  constructor(protected readonly machine: Machine<StateClassMap<NextState>>) {}
  abstract start(): any;
  abstract stop(): any;
};

type StateClass<T extends string> = { new(machine: Machine<any>): State<T> };

type StateClassMap<AllTransitions extends string> = {
  [K in AllTransitions]: StateClass<any>;
};

export type NextStateOf<T> = T extends State<infer Next> ? Next : never;
export type StatesOf<SCM extends StateClassMap<any>> = SCM[TransitionsOf<SCM>];
export type LoadPreciseTransitions<SCM extends StateClassMap<any>> = NextStateOf<InstanceType<SCM[TransitionsOf<SCM>]>>;
export type FullySpecifiedStateClassMap<SCM extends StateClassMap<any>> = {
  [K in LoadPreciseTransitions<SCM>]: StateClass<any>;
}
export type SCMFrom<M> = M extends Machine<infer A> ? A : never;

type StateMap<Map extends StateClassMap<any>> = {
  [K in keyof Map]: InstanceType<Map[K]>;
};

export type TransitionsOf<M> = M extends StateClassMap<infer T> ? T :
                               M extends Machine<infer A> ? TransitionsOf<A> : never;

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

  transition(state: TransitionsOf<Args>) {
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

  current(): InstanceType<Args[TransitionsOf<Args>]> {
    return this._current;
  }

  state(name: TransitionsOf<Args>) {
    return this.stateMap[name];
  }
}
