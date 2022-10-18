import { EventEmitter } from "./src/event-emitter";
export { EventEmitter };

type BaseMessages = {
  stop?: () => any,
} & {
  [key: string]: undefined | ((...args: any) => any),
};

/*
 * State creation
 * =================================================================================================
 */

export class StateBuilder<
  Next extends string,
  M extends BaseMessages,
  Props extends {},
> {
  constructor(
    private readonly machine: Machine<Partial<M>, any, any, any>,
    readonly props: Props
  ) {}

  build<C extends Children<Props>>(args: BuildArgs<M, Props, C>): StateDispatcher<M, Props, C>;
  build(): StateDispatcher<M, Props, {}>;
  build<C extends Children<Props>>(args?: BuildArgs<M, Props, C>) {
    if(args) return new StateDispatcher(args, this.props);
    return new StateDispatcher({ messages: {} }, this.props);
  }

  goto(next: Next, updateProps?: Partial<Props>) {
    // All goto calls from states are actually force calls for the machine; the only use case for
    // transitioning to yourself is to re-run initialization code
    this.machine.force(next, updateProps);
  }
}

type BuildArgs<M extends BaseMessages, Props extends {}, C extends Children<Props>> = {
  children?: C,
  messages: M,
};

type Children<Props extends {}> = {
  [key: string]: Machine<any, any, any, Props>,
};

class DispatchBuilder<
  Next extends string,
  M extends BaseMessages = {},
  Props extends {} = {},
  ParentMessages extends BaseMessages | null = null
> {
  build<Dispatcher extends StateDispatcher<M, Props, any>>(
    buildFn: (
      builder: StateBuilder<Next, M, Props>,
      parent: Parent<NonNullable<ParentMessages>, any>
    ) => Dispatcher
  ): StateFunction<Next, M, Props, Dispatcher, ParentMessages> {
    return (machine, props, parent) => {
      return buildFn(new StateBuilder<Next, M, Props>(machine, props), parent);
    };
  }
}
export function transition<
  Next extends string = never,
  M extends BaseMessages = {},
  Props extends {} = {},
  Parent extends BaseMessages | null = null,
>(): DispatchBuilder<Next, M, Props, Parent> {
  return new DispatchBuilder();
}

type StateFunction<
  _Next extends string,
  M extends BaseMessages,
  Props extends {},
  Dispatcher extends StateDispatcher<M, Props, any>,
  ParentMessages extends BaseMessages | null,
> = (
  machine: Machine<M, any, any, any>,
  props: Props,
  parent: Parent<NonNullable<ParentMessages>, any>
) => Dispatcher;

class Parent<
  M extends BaseMessages,
  Dispatcher extends StateDispatcher<M, any, any>
> {
  constructor(private readonly dispatcher: Dispatcher) {}

  // Allows dispatching any message except the system-reserved "stop" message
  dispatch<Name extends Exclude<keyof M, "stop">>(
    name: Name,
    ...data: Name extends "stop" ? never : Params<M[Name]>
  ) {
    this.dispatcher.dispatchExceptStop(
      name,
      ...data
    );
  }
}

/*
 * Message dispatching for states
 * =================================================================================================
 */

export class StateDispatcher<M extends BaseMessages, P extends {}, C extends Children<P>> {
  readonly hasChildren: boolean; // dumb micro optimization for cpu branch predictor
  readonly children: Children<P>;

  constructor(
    private readonly args: BuildArgs<M, P, C>,
    private readonly props: P
  ) {
    this.children = args.children || {};
    this.hasChildren = !!args.children;
  }

  dispatch<Name extends keyof M>(
    name: Name,
    emitter: EventEmitter<StateEvents<P>> | undefined,
    ...data: Name extends "stop" ? [] : Params<M[Name]>
  ) {
    if(this.hasChildren) {
      for(const key in this.children) {
        const child = this.children[key];
        child.dispatch(name, ...data);
      }
    }

    const handler = this.args.messages[name];
    if(handler) {
      const d = data as any[];
      handler(...d);
    }

    if(emitter && name === "stop") emitter.emit("stop", this.props);
  }

  dispatchExceptStop<Name extends Exclude<keyof M, "stop">>(
    name: Name,
    ...data: Name extends "stop" ? [] : Params<M[Name]>
  ) {
    this.dispatch(name, undefined, ...data);
  }
}

type Params<T> = T extends (...args: any) => any ? Parameters<T> : [];

/*
 * Flyweights for event registration
 * =================================================================================================
 */

export type StateEvents<Props extends {}> = {
  start: Props,
  stop: Props,
};

export class MachineFlyweight<Props extends {}, M extends Machine<any, any, any, any>> {
  readonly dispatchers: {
    [K in M["builders"]]?: DispatcherFlyweight<Props, ReturnType<M["builders"][K]>>;
  } = {};

  events<Name extends keyof M["builders"]>(name: Name): DispatcherFlyweight<Props, ReturnType<M["builders"][Name]>> {
    return upsert(this.dispatchers, name, () => new DispatcherFlyweight());
  }
}

type GetChildren<T> = T extends StateDispatcher<any, any, infer C> ? C : never;
export class DispatcherFlyweight<
  Props extends {},
  Dispatcher extends StateDispatcher<any, Props, any>
> extends EventEmitter<StateEvents<Props>> {
  readonly children: {
    [K in keyof GetChildren<Dispatcher>]?: MachineFlyweight<Props, GetChildren<Dispatcher>[K]>;
  } = {};


  child<Name extends keyof GetChildren<Dispatcher>>(name: Name) {
    return upsert(this.children, name, () => new MachineFlyweight());
  }
}

function upsert<Hash extends {}, Key extends keyof Hash>(
  hash: Hash, key: Key, create: () => NonNullable<Hash[Key]>
): NonNullable<Hash[Key]> {
  let val = hash[key];
  if(val) return val;

  const createdVal = create();
  hash[key] = createdVal;
  return createdVal;
}

/*
 * Machines
 * =================================================================================================
 */

type BuilderMap<M extends BaseMessages, AllTransitions extends string> = {
  [K in AllTransitions]: StateFunction<any, Partial<M>, any, any, any>;
};

// The end goal of this is the final accessor: a way to figure out what keys need to be in the state
// class map you pass into the machine constructor. Otherwise, the class map won't ensure that your
// map is exhaustive; that is, you could have asked for transitions to states that don't exist in
// the map.
type NextStateOf<T> = T extends StateFunction<infer Next, any, any, any, any> ? Next : never;
export type BuilderMapOf<M> = M extends Machine<any, infer BM, any, any> ? BM : never;
// Grab the state transition names from the builder map. This returns whatever transitions are in
// the keys; it doesn't yet tell you which transitions are asked for
export type TransitionNamesOf<M> = M extends BuilderMap<any, infer T> ? T : never;
// Get exactly the list of transitions requested from the builder map
export type LoadPreciseTransitions<BM extends BuilderMap<any, any>> = NextStateOf<
  BM[TransitionNamesOf<BM>]
>;
export type FullySpecifiedBuilderMap<BM extends BuilderMap<any, any>> = {
  [K in LoadPreciseTransitions<BM>]: StateFunction<any, any, any, any, any>;
}

type MachineArgs<
  M extends BaseMessages,
  B extends BuilderMap<M, any>,
  StaticProps extends {},
> = {
  initial: keyof B & string,
  states: B & FullySpecifiedBuilderMap<B>,
  props: StaticProps,
};

export class Machine<
  M extends BaseMessages,
  B extends BuilderMap<M, any>,
  StaticProps extends {},
  DynamicProps extends {},
> {
  readonly builders: B;

  private readonly _dispatcherEventMap: {
    [K in keyof B]?: DispatcherFlyweight<StaticProps & DynamicProps, ReturnType<B[K]>>
  } = {};

  private _current: StateDispatcher<Partial<M>, StaticProps & DynamicProps, any> | null = null;
  private _currentName: keyof B & string;
  private _everRan = false;
  private _running = false;
  private _staticProps: StaticProps;
  private _props: (DynamicProps & StaticProps) | null = null;
  private readonly _initial: keyof B & string;

  protected _parent: Parent<any, any> | null = null;

  constructor(args: MachineArgs<M, B, StaticProps>) {
    this._initial = this._currentName = args.initial;
    this._staticProps = args.props;
    this.builders = args.states;
  }

  running() {
    return this._running;
  }

  goto(next: keyof B & string, updateProps?: Partial<StaticProps & DynamicProps>) {
    // Boilerplate safety
    if(next === this._currentName) return;
    this.force(next, updateProps);
  }

  force(next: keyof B & string, updateProps?: Partial<StaticProps & DynamicProps>) {
    this._assertRunning();
    if(!this._props) throw new Error("Internal error: props are null");

    // Update props, if new ones were passed in
    if(updateProps !== undefined) {
      for(const k in updateProps) {
        // Dumb typecheck workarounds
        const key = k as keyof (StaticProps & DynamicProps);
        this._props[key] = updateProps[key] as any;
      }
    }

    // Manually dispatch and emit on the child! If you call your own dispatch on stop, it'll think
    // the whole machine is stopping.
    this._current?.dispatch("stop", this._dispatcherEventMap[this._currentName]);

    this._currentName = next;
    this._createAndStart(next, this._props);
  }

  current() {
    return this._currentName;
  }

  start(dynamicProps: DynamicProps) {
    if(this._running) return;

    this._everRan = true;
    this._running = true;

    const props = this._props = {
      ...this._staticProps,
      ...dynamicProps,
    };

    this._createAndStart(this._initial, props);
  }

  stop() {
    // This check is necessary for stop idempotence! Otherwise subsequent calls will explode when
    // dispatch asserts that the machine is running.
    if(!this._running) return;
    this.dispatch("stop");
  }

  dispatch<Name extends keyof M>(
    name: Name,
    ...data: Name extends "stop" ? [] : Params<M[Name]>
  ) {
    // Boilerplate safety
    this._assertRunning();
    if(!this._current) throw new Error("Internal error: _current was never initialized");

    this._current.dispatch(name, this._dispatcherEventMap[this._currentName], ...data);

    // Special case handling for the stop event: we must track run state
    if(name === "stop") this._running = false;
  }

  events<Name extends keyof B>(name: Name): DispatcherFlyweight<StaticProps & DynamicProps, ReturnType<B[Name]>> {
    return upsert(this._dispatcherEventMap, name, () => {
      return new DispatcherFlyweight();
    });
  }

  currentEvents() {
    return upsert(this._dispatcherEventMap, this._currentName, () => new DispatcherFlyweight());
  }

  protected _hydrate(
    parent: Parent<any, any>,
    events: MachineFlyweight<StaticProps & DynamicProps, any> | undefined
  ) {
    this._parent = parent;
    if(events) {
      for(const k in events.dispatchers) {
        const key = k as keyof (typeof events.dispatchers);
        const dispatcherFly = events.dispatchers[key];
        if(dispatcherFly) {
          this._dispatcherEventMap[key as keyof B] = dispatcherFly;
        }
      }
    }
  }

  private _createAndStart<N extends keyof B>(name: N & string, props: StaticProps & DynamicProps) {
    const stateBuilder = this.builders[name];
    const current = stateBuilder(this, props, this._parent as any);
    this._current = current;
    this._currentName = name;
    const dispatcherEvent = this._dispatcherEventMap[name];

    // Hydrate child machines
    if(current.hasChildren) {
      const parent = new Parent(current);
      for(const key in current.children) {
        const child = current.children[key];
        const events = dispatcherEvent ? dispatcherEvent.children[key] : undefined;
        child._hydrate(parent, events);
        child.start(props);
      }
    }

    if(dispatcherEvent) dispatcherEvent.emit("start", props);
  }

  private _assertRunning() {
    if(!this._everRan) throw new Error("State machine was never started");
    if(!this._running) throw new Error("State machine is stopped");
  }
}

/*
 * Machine building helpers
 * =================================================================================================
 *
 * Machines are a PITA to manually construct, since they've got so many type params, and you have to
 * manually keep track of which ones you're passing as static vs dynamic props. The following
 * creates a convenient helper function that allows you to just define Messages and Props, like the
 * states do, and automatically infers StaticProps vs DynamicProps based on what you pass into the
 * constructor argument.
 */

type DefinedKeys<Some> = {
  [K in keyof Some]-?: Some[K] extends undefined ? never : K;
}[keyof Some];
type Rest<Full, Some extends Partial<Full>> = Omit<Full, DefinedKeys<Some>>;

type NoStaticPropsArgs<B extends BuilderMap<any, any>> = {
  initial: keyof B & string,
  states: B & FullySpecifiedBuilderMap<B>,
};
export class MachineBuilder<M extends BaseMessages, Props extends {}> {
  build<B extends BuilderMap<M, any>>(args: NoStaticPropsArgs<B>): Machine<M, B, {}, Props>;
  build<B extends BuilderMap<M, any>, StaticProps extends Partial<Props>>(
    args: MachineArgs<M, B, StaticProps>
  ): Machine<M, B, StaticProps, Rest<Props, StaticProps>>;
  build(args: NoStaticPropsArgs<any> | MachineArgs<any, any, any>) {
    if(hasStaticProps(args)) return new Machine(args);

    return new Machine({
      ...args,
      props: {},
    });
  }
}

function hasStaticProps<N extends NoStaticPropsArgs<any>, M extends MachineArgs<any, any, any>>(
  args: N | M
): args is M {
  return (args as MachineArgs<any, any, any>).props !== undefined;
}

export function machine<M extends BaseMessages = {}, Props extends {} = {}>(): MachineBuilder<M, Props> {
  return new MachineBuilder();
}
