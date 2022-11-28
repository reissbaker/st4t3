import { EventEmitter } from "./src/event-emitter";
import { FollowHandler } from "./src/follow-handler";
import { BaseMessages } from "./src/base-messages";
export { EventEmitter, BaseMessages };

/*
 * State creation
 * =================================================================================================
 */

type BuildArgs<
  Next extends string,
  M extends BaseMessages,
  Props extends {},
  C extends Children<Props, M>,
  ReturnedProps extends {},
> = {
  children?: C,
  messages: (goto: Goto<Next, Props>, set: UpdateProps<Props>) => MessageDispatcher<M>,
  stop?: () => any,
  props?: ReturnedProps,
};

export class DispatchBuilder<
  Next extends string,
  M extends BaseMessages,
  Props extends {},
  ParentMessages extends BaseMessages,
  CurrentMiddleware extends Middleware<Next, any, Props, ParentMessages>,
> {
  readonly follow = new FollowHandler();
  private readonly middleware: Array<StateDispatcher<Next, M, Props, ParentMessages, any, any>>;
  readonly props: Props & MiddlewareProps<CurrentMiddleware>;

  constructor(
    private readonly machine: Machine<any, any, any, any, any>,
    props: Props,
    readonly parent: Parent<ParentMessages>,
    middleware: CurrentMiddleware,
    private readonly friend: FriendMethods<Props>,
  ) {
    this.middleware = Object.values(middleware || {}).map(buildFn => {
      return buildFn(machine, props, parent, null as any, friend)
    });
    const middlewareProps: Partial<MiddlewareProps<CurrentMiddleware>> = {};
    for(const dispatcher of this.middleware) {
      if(!dispatcher.returnedProps) continue;
      for(const key in dispatcher.returnedProps) {
        //@ts-ignore
        middlewareProps[key] = dispatcher.returnedProps[key];
      }
    }

    this.props = {
      ...props,
      ...middlewareProps,
    } as Props & MiddlewareProps<CurrentMiddleware>;
  }

  /*
   * What is the point of these methods? Why not return the raw BuildArgs, which would be easier to
   * manipulate programmatically since they're just ordinary hashes?
   *
   * The reason for these is to enforce type safety. The TypeScript compiler will enforce that the
   * hashes you return have *at least* the expected keys, but won't enforce that extra keys are
   * errors. Since most of the type safety boundaries in this library are more or less "you typed
   * the same thing over here as you typed over there," not checking for extra keys is a pretty bad
   * error: it means that typos typecheck, and that if you have e.g. longMispelledName instead of
   * longMisspelledName as a message handler your code will silently fail. Forcing you to call
   * .build({ ... }) ensures you don't miss keys (and if we don't make .build({ ... }) return
   * special objects, you could forget to call it and instead return the raw hashes, which would
   * once again potentially silently fail).
   *
   * IMO, making typos fail typechecking is more useful than making it super easy to manipulate the
   * arguments programmatically. We've added explicit support for middleware, which accomplishes
   * much of the same tasks, rather than making it simple-but-error-prone to manipulate the output
   * of the builder functions.
   */
  build(): StateDispatcher<Next, M, Props, ParentMessages, {}, {}>;
  build<C extends Children<Props, M>, ReturnedProps extends {}>(
    args: BuildArgs<Next, M, Props, C, ReturnedProps>
  ): StateDispatcher<Next, M, Props, ParentMessages, C, ReturnedProps>;
  build<
    C extends Children<Props, M>, ReturnedProps extends {}
  >(args?: BuildArgs<Next, M, Props, C, ReturnedProps>) {
    if(args) {
      return new StateDispatcher<Next, M, Props, ParentMessages, C, ReturnedProps>(
        args, this.follow, this.machine, this.middleware, this.props, this.friend
      );
    }
    return new StateDispatcher(
      { messages: () => this.messages({} as M) },
      this.follow,
      this.machine,
      this.middleware,
      this.props,
      this.friend,
    );
  }

  messages(messages: M): MessageDispatcher<M> {
    return new MessageDispatcher(messages);
  }

  msg(messages: M): MessageDispatcher<M> {
    return this.messages(messages);
  }

  dispatch<Name extends keyof M>(name: Name, ...data: Params<M[Name]>) {
    this.machine.dispatch(name, ...data);
  }

  child<
    ChildM extends BaseMessages = {},
    ChildProps extends Props = Props
  >(): MachineBuilder<ChildM, ChildProps, Parent<M>, Props> {
    return new MachineBuilder();
  }
}

type Children<Props extends {}, ParentMessages extends BaseMessages> = {
  [key: string]: Machine<any, any, any, Props, Parent<ParentMessages>>,
};

export class StateBuilder<
  Next extends string,
  M extends BaseMessages = {},
  Props extends {} = {},
  ParentMessages extends BaseMessages = {},
  CurrentMiddleware extends Middleware<Next, any, Props, ParentMessages> = {},
> {
  constructor(
    private readonly _middleware: CurrentMiddleware = {} as CurrentMiddleware
  ) {}

  // Override for empty build constructor: ultra shorthand syntax
  build(): DispatchBuildFn<
    Next, {}, {}, StateDispatcher<Next, {}, {}, ParentMessages, never, {}>, ParentMessages, {}
  >;

  // Override for actually providing a real builder function
  build<ReturnedProps extends {}, Dispatcher extends StateDispatcher<
    Next,
    MessagesForDispatch<M, CurrentMiddleware>,
    StateProps<Props, CurrentMiddleware>,
    ParentMessages,
    any,
    ReturnedProps
  >>(
    curryBuildFn: (
      builder: DispatchBuilder<
        Next, MessagesForDispatch<M, CurrentMiddleware>, Props, ParentMessages, CurrentMiddleware
      >
    ) => Dispatcher
  ): DispatchBuildFn<
    Next,
    MessagesForDispatch<M, CurrentMiddleware>,
    StateProps<Props, CurrentMiddleware>,
    Dispatcher,
    ParentMessages,
    ReturnedProps
  >;

  // The implementation for the two overrides
  build<ReturnedProps extends {}, Dispatcher extends StateDispatcher<
    Next,
    MessagesForDispatch<M, CurrentMiddleware>,
    StateProps<Props, CurrentMiddleware>,
    ParentMessages,
    any,
    ReturnedProps
  >>(
    curryBuildFn?: (
      builder: DispatchBuilder<
        Next, MessagesForDispatch<M, CurrentMiddleware>, Props, ParentMessages, CurrentMiddleware
      >
    ) => Dispatcher
  ) {
    return (machine: any, props: any, parent: any, _: any, friend: any) => {
      if(!curryBuildFn) {
        curryBuildFn = (
          (state: DispatchBuilder<Next, any, Props, ParentMessages, CurrentMiddleware>) => {
            return state.build({ messages: () => state.messages({}) });
          }) as (
            (builder: DispatchBuilder<
              Next,
              MessagesForDispatch<M, CurrentMiddleware>,
              Props,
              ParentMessages,
              CurrentMiddleware
            >) => Dispatcher
          );
      }
      return curryBuildFn(
        new DispatchBuilder<
          Next, MessagesForDispatch<M, CurrentMiddleware>, Props, ParentMessages, CurrentMiddleware
        >(
          machine, props, parent, this._middleware, friend
        )
      );
    };
  }

  middleware<NewMiddleware extends Middleware<any, any, Props, ParentMessages>>(
    middleware: CheckMiddlewareProps<
      CheckMiddlewareVariance<
        MiddlewareNext<NewMiddleware>,
        Next,
        NoDuplicateKeys<NewMiddleware, CurrentMiddleware>
      >,
      Props
    >
  ): StateBuilder<
    Next,
    M,
    Props,
    ParentMessages,
    CurrentMiddleware & NewMiddleware
  > {
    //@ts-ignore
    return new StateBuilder({
      ...this._middleware,
      ...middleware,
    });
  }
}

// Types to check middleware variance
type MiddlewareMessages<T> = T extends Middleware<any, infer M, any, any> ? M : never;
type MiddlewareNext<T> = T extends Middleware<infer N, any, any, any> ? N : never;
type MessagesForDispatch<M extends BaseMessages, CurrentMiddleware> =
  IfEquals<CurrentMiddleware, {}> extends true ? M :
    Omit<M, keyof MiddlewareMessages<CurrentMiddleware>>
      & OptionalOverride<MiddlewareMessages<CurrentMiddleware>, M>;

type CheckMiddlewareVariance<MiddlewareNext extends string, Next extends string, M> =
  [MiddlewareNext] extends [never] ? M :
  IfEquals<MiddlewareNext, Next> extends true ? M :
  IsStringUnionSubtype<MiddlewareNext, Next, M>;

// Types to check middleware props
type CheckMiddlewareProps<NewMiddleware extends Middleware<any, any, any, any>, Props extends {}> =
  IfEquals<NewMiddleware, {}> extends true ? NewMiddleware :
    Props extends MiddlewareProps<NewMiddleware> ? NewMiddleware : never;

type BuildFnProps<T> = T extends DispatchBuildFn<any, any, any, infer D, any, any> ?
  D extends StateDispatcher<any, any, any, any, any, infer RP> ?
    RP : never : never;
type MiddlewarePropsUnion<T extends Middleware<any, any, any, any>> = {
  [K in keyof T]: BuildFnProps<T[K]>;
}[keyof T];
type UnionToIntersection<U> =
  (U extends any ? (k: U)=>void : never) extends ((k: infer I)=>void) ? I : never
export type MiddlewareProps<T extends Middleware<any, any, any, any>> =
  UnionToIntersection<MiddlewarePropsUnion<T>>;

// Type to remove props from a set if they're defined in the middleware
type StateProps<Props extends {}, CurrentMiddleware extends Middleware<any, any, any, any>> =
  IfEquals<CurrentMiddleware, {}> extends true ? Props :
    Omit<Props, keyof MiddlewareProps<CurrentMiddleware>>;

// Normally checking whether SmallerUnion extends BiggerUnion will return true *regardless of which
// is larger.* You can hack around this via the behavior of Exclude, which doesn't suffer from this
// flaw.
type IsStringUnionSubtype<SmallerUnion, BiggerUnion, RetVal> = IfNever<
  Exclude<BiggerUnion, SmallerUnion>
> extends false ? RetVal : never;

// Checking strict string union *subtyping* doesn't cover the case in which two string types are
// exactly equal. If they are, you probably also want to have it succeed.
type IfEquals<T, U, Y=true, N=false> =
  (<G>() => G extends T ? 1 : 2) extends
  (<G>() => G extends U ? 1 : 2) ? Y : N;

// Checking for never extension seems broken. A workaround is wrapping with an array and checking
// for never arrays
type IfNever<T> = [T] extends [never] ? true : false;

type Middleware<
  Next extends string,
  M extends BaseMessages,
  Props extends {},
  ParentMessages extends BaseMessages,
> = {
  [key: string]: DispatchBuildFn<
    Next,
    M,
    Props,
    StateDispatcher<Next, M, Props, ParentMessages, any, any>,
    ParentMessages,
    any
  >
};

type NoDuplicateKeys<T, U> = IfNever<U> extends true ? T :
  IfNever<T> extends true ? T : keyof T extends keyof U ? never : T;

type OptionalOverride<Middleware extends {}, Overrides extends {}> =
  {} extends Middleware ? {} : {
    [K in keyof Middleware]?: K extends keyof Overrides ? Overrides[K] : never;
  };

export function transition<
  Next extends string = never,
  M extends BaseMessages = {},
  Props extends {} = {},
  Parent extends BaseMessages = {},
>(): StateBuilder<Next, M, Props, Parent> {
  return new StateBuilder();
}

// "Friend methods" a la C++
// Since JS/TS doesn't have "friend" types -- e.g. types that are allowed to call other types'
// private methods -- we pass in a hash of friendly methods that we're letting someone call, even
// though on our end these are private methods. For example, we don't want to expose prop updating
// outside of message handlers, but we want message handlers to be able to update props on the
// machine -- so the machine generates a friend hash and passes it through to the builders.
type UpdateProps<Props extends {}> = (props: Partial<Props>) => void;
type FriendMethods<Props extends {}> = {
  updateProps: UpdateProps<Props>,
};

// Complex type that we build for constructing new states. It takes one fake param (the last one),
// solely used to force ParentMessages to be contravariant. We always pass null to that param and
// cast to any.
export type DispatchBuildFn<
  Next extends string,
  M extends BaseMessages,
  Props extends {},
  Dispatcher extends StateDispatcher<Next, M, Props, ParentMessages, any, ReturnedProps>,
  ParentMessages extends BaseMessages,
  ReturnedProps extends {}
> = (
  machine: Machine<any, any, any, any, any>,
  props: Props,
  parent: Parent<NonNullable<ParentMessages>>,
  _: ParentMessages,
  friend: FriendMethods<Props>,
) => Dispatcher;

export class Parent<M extends BaseMessages> {
  constructor(private readonly dispatcher: StateDispatcher<any, M, any, any, any, any>) {}

  dispatch<Name extends keyof M>(name: Name, ...data: Params<M[Name]>) {
    this.dispatcher.dispatch(
      name,
      ...data
    );
  }
}

// Message creation
// -------------------------------------------------------------------------------------------------

function gotoBuilder<Next extends string, Props extends {}>(
  machine: Machine<any, any, any, any, any>
): Goto<Next, Props> {
  return function goto(next, updateProps?) {
    machine.force(next, updateProps);
  };
}

export type Goto<Next extends string, Props extends {}> = (
  next: Next, updateProps?: Partial<Props>
) => void;

/*
 * Message dispatching for states
 * =================================================================================================
 */

export class MessageDispatcher<M extends BaseMessages> {
  constructor(
    private readonly messages: M
  ) {}
  dispatch<Name extends keyof M>(name: Name, ...data: Params<M[Name]>) {
    const handler = this.messages[name];
    if(handler) handler(...data as any[]);
  }
}

export class StateDispatcher<
  Next extends string,
  M extends BaseMessages,
  P extends {},
  ParentMessages extends BaseMessages,
  C extends Children<P, M>,
  ReturnedProps extends {}
> {
  readonly hasChildren: boolean; // dumb micro optimization for cpu branch predictor
  readonly children: Children<P, M>;
  readonly returnedProps?: ReturnedProps & Partial<P>;
  readonly props: Partial<P>; // variance rules are annoying when combining middleware

  private readonly _stop: (() => any) | undefined;
  private readonly messages: MessageDispatcher<M>;

  // When a middleware or state calls goto(), eventually stop() will be called, and this state will
  // permanently die. Future states are new instantiations of this class. We can track whether this
  // state is dead by tracking stop() calls, which allows short-circuiting if a middleware calls
  // goto() somewhere in the chain.
  private _dead = false;

  constructor(
    args: BuildArgs<Next, M, P, C, ReturnedProps>,
    private readonly follow: FollowHandler,
    machine: Machine<any, any, any, any, any>,
    private readonly middleware: Array<StateDispatcher<Next, M, P, ParentMessages, any, any>>,
    props: P,
    friend: FriendMethods<P>,
  ) {
    this.children = args.children || {};
    this.hasChildren = !!args.children;
    this.messages = args.messages(gotoBuilder(machine), friend.updateProps);
    this._stop = args.stop;
    this.returnedProps = args.props;
    this.props = props;
  }

  dispatch<Name extends keyof M>(
    name: Name,
    ...data: Params<M[Name]>
  ) {
    // no-op if goto got called before you did
    if(this._dead) return;

    if(this.hasChildren) {
      for(const key in this.children) {
        const child = this.children[key];
        child.dispatch(name, ...data);
      }
    }

    for(let i = 0; i < this.middleware.length; i++) {
      this.middleware[i].dispatch(name, ...data);
      // no-op the rest of this function if a middleware called goto
      if(this._dead) return;
    }

    this.messages.dispatch(name, ...data);
  }

  stop() {
    this._dead = true;

    if(this.hasChildren) {
      for(const key in this.children) {
        const child = this.children[key];
        child.stop();
      }
    }

    for(let i = 0; i < this.middleware.length; i++) {
      this.middleware[i].stop();
    }

    if(this._stop) this._stop();

    this.follow.clear();
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

export class MachineFlyweight<Props extends {}, M extends Machine<any, any, any, any, any>> {
  readonly dispatchers: {
    [K in M["builders"]]?: DispatcherFlyweight<Props, ReturnType<M["builders"][K]>>;
  } = {};

  events<Name extends keyof M["builders"]>(
    name: Name
  ): DispatcherFlyweight<Props, ReturnType<M["builders"][Name]>> {
    return upsert(this.dispatchers, name, () => new DispatcherFlyweight());
  }
}

export type GetChildren<T> = T extends StateDispatcher<any, any, any, any, infer C, any> ? C : never;
export class DispatcherFlyweight<
  Props extends {},
  Dispatcher extends StateDispatcher<any, any, Props, any, any, any>
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

type BuilderMap<
  M extends BaseMessages,
  AllTransitions extends string,
  Props extends {},
  ParentType extends Parent<any> | null
> = {
  [K in AllTransitions]: DispatchBuildFn<any, Partial<M>, Props, any, MessagesFrom<ParentType>, any>;
};

export type MessagesFrom<P> = P extends Parent<infer M> ? M : {};

// The end goal of this is the final accessor: a way to figure out what keys need to be in the state
// class map you pass into the machine constructor. Otherwise, the class map won't ensure that your
// map is exhaustive; that is, you could have asked for transitions to states that don't exist in
// the map.
type NextStateOf<T> = T extends DispatchBuildFn<infer Next, any, any, any, any, any> ? Next : never;
export type BuilderMapOf<M> = M extends Machine<any, infer BM, any, any, any> ? BM : never;
// Grab the state transition names from the builder map. This returns whatever transitions are in
// the keys; it doesn't yet tell you which transitions are asked for
export type TransitionNamesOf<M> = M extends BuilderMap<any, infer T, any, any> ? T : never;
// Get exactly the list of transitions requested from the builder map
export type LoadPreciseTransitions<BM extends BuilderMap<any, any, any, any>> = NextStateOf<
  BM[TransitionNamesOf<BM>]
>;
export type FullySpecifiedBuilderMap<BM extends BuilderMap<any, any, any, any>> = {
  [K in LoadPreciseTransitions<BM>]: DispatchBuildFn<any, any, any, any, any, any>;
}

export type RestrictParentProps<StaticProps extends {}, ParentProps extends {}> = {
  [K in keyof StaticProps]: K extends keyof ParentProps ? never : StaticProps[K];
};

type MachineArgs<
  M extends BaseMessages,
  StaticProps extends {},
  B extends BuilderMap<M, any, any, any>,
  ParentProps extends {},
> = {
  initial: keyof B & string,
  states: B & FullySpecifiedBuilderMap<B>
  props: StaticProps & RestrictParentProps<StaticProps, ParentProps>
};

export class Machine<
  M extends BaseMessages,
  B extends BuilderMap<M, any, any, ParentType>,
  StaticProps extends {},
  DynamicProps extends {},
  ParentType extends Parent<any> | null
> {
  readonly builders: B;

  private readonly _dispatcherEventMap: {
    [K in keyof B]?: DispatcherFlyweight<StaticProps & DynamicProps, ReturnType<B[K]>>
  } = {};

  private _current: StateDispatcher<
    any, Partial<M>, StaticProps & DynamicProps, any, any, any
  > | null = null;

  private _currentName: keyof B & string;
  private _everRan = false;
  private _running = false;
  private _staticProps: StaticProps;
  private _props: (DynamicProps & StaticProps) | null = null;
  private readonly _initial: keyof B & string;

  protected _parent: ParentType | null = null;

  private _dispatchQueue: Array<{ name: keyof M, data: any[] }> = [];
  private _isStartingNewState = false;

  constructor(args: MachineArgs<M, StaticProps, B, any>) {
    this._initial = this._currentName = args.initial;
    this._staticProps = args.props;
    this.builders = args.states;
  }

  running() {
    return this._running;
  }

  props(): StaticProps & DynamicProps {
    if(!this._props) throw new Error("Internal error: props are null");
    return this._props;
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
      this._updateProps(updateProps);
    }

    this._stopCurrent();
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

    this._stopCurrent();
    this._running = false;
  }

  dispatch<Name extends keyof M>(
    name: Name,
    ...data: Params<M[Name]>
  ) {
    this._assertRunning();

    // If you're starting a new state, queue the dispatch. The state creation code will pick up once
    // the state creation is done.
    if(this._isStartingNewState) {
      this._dispatchQueue.push({ name, data });
      return;
    }

    if(!this._current) throw new Error("Internal error: _current was never initialized");

    this._current.dispatch(name, ...data);
  }

  events<Name extends keyof B>(
    name: Name
  ): DispatcherFlyweight<StaticProps & DynamicProps, ReturnType<B[Name]>> {
    return upsert(this._dispatcherEventMap, name, () => {
      return new DispatcherFlyweight();
    });
  }

  currentEvents() {
    return upsert(this._dispatcherEventMap, this._currentName, () => new DispatcherFlyweight());
  }

  protected _hydrate(
    parent: ParentType,
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

  private _updateProps(updateProps: Partial<StaticProps & DynamicProps>) {
    if(!this._props) throw new Error("Internal error: props are null");
    for(const k in updateProps) {
      // Dumb typecheck workarounds
      const key = k as keyof (StaticProps & DynamicProps);
      this._props[key] = updateProps[key] as any;
    }
  }

  private _createAndStart<N extends keyof B>(name: N & string, props: StaticProps & DynamicProps) {
    const stateBuilder = this.builders[name];
    this._currentName = name;

    this._isStartingNewState = true;
    const current = this._current = stateBuilder(this, props, this._parent as any, null as any, {
      updateProps: (props) => {
        this._updateProps(props);
      },
    });
    this._isStartingNewState = false;

    const dispatcherEvent = this._dispatcherEventMap[name];

    // Hydrate child machines
    if(current.hasChildren) {
      const parent = new Parent(current);
      for(const key in current.children) {
        const child = current.children[key];
        const events = dispatcherEvent ? dispatcherEvent.children[key] : undefined;
        child._hydrate(parent, events);
        child.start(current.props); // Use the dispatcher props since middleware may have added data
      }
    }

    // Dequeue from the dispatch queue if necessary
    if(this._dispatchQueue.length !== 0) {
      for(let i = 0; i < this._dispatchQueue.length; i++) {
        const queued = this._dispatchQueue[i];
        this.dispatch(queued.name, ...queued.data as any);
      }
      this._dispatchQueue = [];
    }

    if(dispatcherEvent) dispatcherEvent.emit("start", props);
  }

  private _stopCurrent() {
    if(!this._current) throw new Error("Internal error: _current was never initialized");
    if(!this._props) throw new Error("Internal error: _props was never initialized");

    this._current.stop();
    const dispatcherEvent = this._dispatcherEventMap[this._currentName];
    if(dispatcherEvent) dispatcherEvent.emit("stop", this._props);
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

type NoStaticPropsArgs<
  B extends BuilderMap<any, any, any, any>,
> = {
  initial: keyof B & string,
  states: B & FullySpecifiedBuilderMap<B>
};

export class MachineBuilder<
  M extends BaseMessages,
  Props extends {},
  ParentType extends Parent<any> | null,
  ParentProps extends {}
> {
  build<B extends BuilderMap<M, any, Props, ParentType>>(
    // If there is a parent, ensure that the parent's props are a subtype of this machine's props.
    // If they aren't, the user needs to specify the extra props as static props using the other
    // override build function
    args: ParentType extends null ? NoStaticPropsArgs<B> : (
      ParentProps extends Props ? NoStaticPropsArgs<B> : never
    )
  ): Machine<M, B, {}, Props, ParentType>;

  build<
    B extends BuilderMap<M, any, Props, ParentType>,
    StaticProps extends Partial<Props>
  >(
    args: MachineArgs<M, StaticProps, B, ParentProps>
  ): Machine<M, B, StaticProps, Rest<Props, StaticProps>, ParentType>;

  build<
    B extends BuilderMap<M, any, Props, ParentType>,
    StaticProps extends Partial<Props>
  >(args: NoStaticPropsArgs<B> | MachineArgs<M, StaticProps, B, ParentProps>) {
    if(hasStaticProps(args)) return new Machine(args);

    return new Machine({
      ...args,
      props: {},
    });
  }
}

function hasStaticProps<
  N extends NoStaticPropsArgs<any>,
  M extends MachineArgs<any, any, any, any>
>(args: N | M): args is M {
  return (args as MachineArgs<any, any, any, any>).props !== undefined;
}

export function machine<
  M extends BaseMessages = {},
  Props extends {} = {}
>(): MachineBuilder<M, Props, null, {}> {
  return new MachineBuilder();
}
