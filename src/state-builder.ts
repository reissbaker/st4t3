import { EventEmitter } from "./event-emitter";

type BaseMessages = {
  stop?: () => any,
} & {
  [key: string]: undefined | ((...args: any) => any),
};

/*
 * State creation
 * =================================================================================================
 */

export class StateBuilder<Next extends string, M extends BaseMessages, Props extends {}> {
  constructor(
    private readonly machine: Machine<Partial<M>, BuilderMap<Next, any>, any, any>,
    readonly props: Props
  ) {}

  build<C extends Children<M, Props>>(args: BuildArgs<M, Props, C>): StateDispatcher<M, Props, C>;
  build(): StateDispatcher<M, Props, {}>;
  build<C extends Children<M, Props>>(args?: BuildArgs<M, Props, C>) {
    if(args) return new StateDispatcher(args, this.props);
    return new StateDispatcher({ messages: {} }, this.props);
  }

  goto(next: Next & string) {
    this.machine.goto(next);
  }
}

type BuildArgs<M extends BaseMessages, Props extends {}, C extends Children<M, Props>> = {
  children?: C,
  messages: M,
};

type Children<M extends BaseMessages, Props extends {}> = {
  [key: string]: Machine<Partial<M>, any, any, Partial<Props>>,
};

class DispatchBuilder<
  Next extends string,
  M extends BaseMessages = {},
  Props extends {} = {}
> {
  build<Dispatcher extends StateDispatcher<M, Props, any>>(
    buildFn: (builder: StateBuilder<Next, M, Props>) => Dispatcher
  ): StateFunction<Next, M, Props, Dispatcher> {
    return (machine, props) => {
      return buildFn(new StateBuilder<Next, M, Props>(machine, props));
    };
  }
}
export function transition<
  Next extends string = never,
  M extends BaseMessages = {},
  Props extends {} = {}
>(): DispatchBuilder<Next, M, Props> {
  return new DispatchBuilder();
}

export type StateFunction<
  Next extends string,
  M extends BaseMessages,
  Props extends {},
  Dispatcher extends StateDispatcher<M, Props, any>
> = (
  machine: Machine<M, BuilderMap<Next, any>, any, any>,
  props: Props
) => Dispatcher;

/*
 * Message dispatching for states
 * =================================================================================================
 */

export class StateDispatcher<M extends BaseMessages, P extends {}, C extends Children<M, P>> {
  readonly hasChildren: boolean; // dumb micro optimization for cpu branch predictor
  readonly children: Children<M, P>;

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
  private readonly dispatchers: {
    [K in M["builders"]]?: DispatcherFlyweight<Props, ReturnType<M["builders"][K]>>;
  } = {};

  _emit<Name extends keyof StateEvents<Props>>(name: Name, data: StateEvents<Props>[Name]) {
    for(const k in this.dispatchers) {
      const key: keyof M["builders"] = k;
      const child = this.dispatchers[key];
      if(child) child.emit(name, data);
    }
  }

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

  override emit<Name extends keyof StateEvents<Props>>(name: Name, data: StateEvents<Props>[Name]) {
    for(const key in this.children) {
      const child = this.children[key];
      if(child) child._emit(name, data);
    }
    super.emit(name, data);
  }

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

type BuilderMap<Transitions extends string, M extends BaseMessages> = {
  [K in Transitions]: StateFunction<any, Partial<M>, any, any>;
};

type MachineArgs<
  M extends BaseMessages,
  B extends BuilderMap<any, M>,
  StaticProps extends {},
> = {
  initial: keyof B,
  states: B,
  staticProps: StaticProps,
};

export class Machine<
  M extends BaseMessages,
  B extends BuilderMap<any, M>,
  StaticProps extends {},
  DynamicProps extends {},
> {
  readonly builders: B;

  private readonly _dispatcherEventMap: {
    [K in keyof B]?: DispatcherFlyweight<StaticProps & DynamicProps, ReturnType<B[K]>>
  } = {};

  private _current: StateDispatcher<Partial<M>, StaticProps & DynamicProps, any> | null = null;
  private _currentName: keyof B;
  private _everRan = false;
  private _running = false;
  private _staticProps: StaticProps;
  private _props: (DynamicProps & StaticProps) | null = null;
  private readonly _initial: keyof B;

  constructor(args: MachineArgs<M, B, StaticProps>) {
    this._initial = this._currentName = args.initial;
    this._staticProps = args.staticProps;
    this.builders = args.states;
  }

  running() {
    return this._running;
  }

  goto(next: keyof B & string) {
    // Boilerplate safety
    this._assertRunning();
    if(next === this._currentName) return;
    if(!this._props) throw new Error("Internal error: props are null");

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

  private _createAndStart<N extends keyof B>(name: N, props: StaticProps & DynamicProps) {
    const stateBuilder = this.builders[name];
    const current = stateBuilder(this, props);
    this._current = current;
    this._currentName = name;

    // Hydrate child machines
    if(current.hasChildren) {
      for(const key in current.children) {
        const child = current.children[key];
        child.start(props);
      }
    }

    const dispatcherEvent = this._dispatcherEventMap[name];
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
  initial: keyof B,
  states: B,
};
class MachineBuilder<M extends BaseMessages, Props extends {}> {
  build<B extends BuilderMap<any, M>>(args: NoStaticPropsArgs<B>): Machine<M, B, {}, Props>;
  build<B extends BuilderMap<any, M>, StaticProps extends Partial<Props>>(
    args: MachineArgs<M, B, StaticProps>
  ): Machine<M, B, StaticProps, Rest<Props, StaticProps>>;
  build(args: NoStaticPropsArgs<any> | MachineArgs<any, any, any>) {
    if(hasStaticProps(args)) return new Machine(args);

    return new Machine({
      ...args,
      staticProps: {},
    });
  }
}

function hasStaticProps<N extends NoStaticPropsArgs<any>, M extends MachineArgs<any, any, any>>(
  args: N | M
): args is M {
  return (args as MachineArgs<any, any, any>).staticProps !== undefined;
}

export function machine<M extends BaseMessages = {}, Props extends {} = {}>(): MachineBuilder<M, Props> {
  return new MachineBuilder();
}
