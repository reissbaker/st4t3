type Messages = {
  stop?: never,
};

/*
 * State creation
 * =================================================================================================
 */

type BuildArgs<M extends Messages, Props extends {}> = {
  children?: {
    [key: string]: Machine<Partial<M>, any, any, Partial<Props>>,
  },
  messages: {
    [K in keyof M]: (data: M[K]) => any;
  },
};

export type StateFunction<
  Next extends string, M extends Messages, Props extends {}
> = (
  machine: Machine<M, BuilderMap<Next, any>, any, any>,
  props: Props
) => StateDispatcher<M, Props>;

export function transitionTo<
  Next extends string,
  M extends Messages = {},
  Props extends {} = {}
>(
  buildFn: (builder: StateBuilder<Next, M, Props>) => StateDispatcher<M, Props>
): StateFunction<Next, M, Props> {
  return (machine, props) => {
    return buildFn(new StateBuilder<Next, M, Props>(machine, props));
  };
}

export class StateBuilder<Next extends string, M extends Messages, Props extends {}> {
  constructor(
    private readonly machine: Machine<M, BuilderMap<Next, any>, any, any>,
    readonly props: Props
  ) {}

  build(args: BuildArgs<M, Props>) {
    // Hydrate the child machines
    // TODO: Once you add the event system, you'll probably want to move this out and have machines
    // hydrate children, rather than doing it in build() where events haven't been registered yet
    if(args.children) {
      for(const key in args.children) {
        const child = args.children[key];
        child.start(this.props);
      }
    }

    return new StateDispatcher(args);
  }

  goto(next: Next & string) {
    this.machine.goto(next);
  }
}

/*
 * Message dispatching for states
 * =================================================================================================
 */

export class StateDispatcher<M extends Messages, Props extends {}> {
  constructor(
    private readonly args: BuildArgs<M, Props>
  ) {}

  dispatch<Name extends keyof M>(name: Name, data: M[Name]) {
    if(this.args.children) {
      for(const key in this.args.children) {
        const child = this.args.children[key];
        child.dispatch(name, data);
      }
    }
    if(this.args.messages[name]) {
      this.args.messages[name](data);
    }
  }
}

/*
 * Machines
 * =================================================================================================
 */

type BuilderMap<Transitions extends string, M extends Messages> = {
  [K in Transitions]: StateFunction<any, Partial<M>, any>;
};

type MachineArgs<
  M extends Messages,
  B extends BuilderMap<any, M>,
  StaticProps extends {},
> = {
  initial: keyof B,
  states: B,
  staticProps: StaticProps,
};

export class Machine<
  M extends Messages,
  B extends BuilderMap<any, M>,
  StaticProps extends {},
  DynamicProps extends {},
> {
  private readonly _builders: B;
  private _current: StateDispatcher<Partial<M>, StaticProps & DynamicProps> | null = null;
  private _currentName: keyof B;
  private _everRan = false;
  private _running = false;
  private _staticProps: StaticProps;
  private _props: (DynamicProps & StaticProps) | null = null;
  private readonly _initial: keyof B;

  constructor(args: MachineArgs<M, B, StaticProps>) {
    this._initial = this._currentName = args.initial;
    this._staticProps = args.staticProps;
    this._builders = args.states;
  }

  goto(next: keyof B & string) {
    // Boilerplate safety
    this._assertRunning();
    if(!this._props) throw new Error("Internal error: props are null");

    this._current?.dispatch("stop", undefined);
    this._currentName = next;
    this._createAndStart(next, this._props);
  }

  currentName() {
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
    this.dispatch("stop", undefined);
  }

  dispatch<Name extends keyof M>(name: Name, data: M[Name]) {
    // Boilerplate safety
    this._assertRunning();
    if(!this._current) throw new Error("Internal error: _current was never initialized");

    // Special case handling for the stop event: we must track run state
    if(name === "stop") this._running = false;

    this._current.dispatch(name, data);
  }

  private _createAndStart<N extends keyof B>(name: N, props: StaticProps & DynamicProps) {
    const stateBuilder = this._builders[name];
    this._current = stateBuilder(this, props);
    this._currentName = name;
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

class MachineBuilder<M extends Messages, Props extends {}> {
  build<B extends BuilderMap<any, M>, StaticProps extends Partial<Props>>(args: MachineArgs<M, B, StaticProps>) {
    return new Machine<M, B, StaticProps, Rest<Props, StaticProps>>(args);
  }
}

export function machine<M extends Messages, Props extends {}>(): MachineBuilder<M, Props> {
  return new MachineBuilder();
}
