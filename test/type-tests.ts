import * as create from "../index";

function testType(cb: () => any) {
  cb();
}

testType(() => {
  // It should throw an error when you try to goto a state when you declared you never transition
  type Messages = { test(): void };
  create.transition<never, Messages>().build(state => state.build({
    messages: goto => state.msg({
      test() {
        //@ts-expect-error
        goto("hi");
      }
    }),
  }));
});

testType(() => {
  // It should throw an error when you try to goto a state you didn't declare
  type Messages = { test(): void };
  create.transition<"hi", Messages>().build(state => state.build({
    messages: goto => state.msg({
      test() {
        //@ts-expect-error
        goto("bye");
      }
    }),
  }));
});

testType(() => {
  // It should throw an error when assigning a not-fully-specified machine
  const NotFinal = create.transition<'Final'>().build(state => state.build());
  create.machine().build({
    initial: 'NotFinal',
    // @ts-expect-error
    states: { NotFinal }
  });
});

testType(() => {
  // It should throw an error if initial is not a name in the map
  const Final = create.transition().build(state => state.build());
  create.machine().build({
    // @ts-expect-error
    initial: 'NotFinal',
    states: { Final },
  });
});

testType(() => {
  // It should throw an error if a state requests a property not offered by the machine
  const Final = create.transition<never, {}, { b: string, a: string }>().build(state => {
    return state.build();
  });

  // Try without static props
  create.machine().build({
    initial: 'Final',
    // @ts-expect-error
    states: { Final },
  });

  // Try with static props
  create.machine().build({
    initial: 'Final',
    // @ts-expect-error
    states: { Final },
    props: {
      a: '',
    }
  });
});

testType(() => {
  // It should throw an error if the child machine is constructed with the wrong parent type
  const Inner = create.transition().build();
  create.transition().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: create.machine().build({
        initial: "Inner",
        states: { Inner },
      }),
    },
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should throw an error if the child machine is constructed with mismatched argument types
  type ParentMessages = {
    next(a: string): void,
  };
  const Inner = create.transition<never, {}, {}, ParentMessages>().build();

  create.transition<never, { next(a: number): void }>().build(state => {
    return state.build({
      children: {
        inner: state.child().build({
          initial: "Inner",
          // @ts-expect-error
          states: { Inner },
        }),
      },
      messages: () => state.msg({
        next(_: number) {
        }
      }),
    })
  });
});

testType(() => {
  // It should throw an error if the child machine is constructed with messages that don't exist
  type ParentMessages = {
    next(a: string): void,
  };
  const Inner = create.transition<never, {}, {}, ParentMessages>().build();

  create.transition<never>().build(state => {
    return state.build({
      children: {
        inner: state.child().build({
          initial: "Inner",
          // @ts-expect-error
          states: { Inner },
        }),
      },
      messages: () => state.msg({}),
    })
  });
});

testType(() => {
  // It should be fine to construct a parent type with messages, and have the child ignore them
  const Inner = create.transition().build();

  type ParentMessages = {
    next(a: string): void,
  };
  create.transition<never, ParentMessages>().build(state => state.build({
    children: {
      inner: state.child().build({
        initial: "Inner",
        states: { Inner },
      }),
    },
    messages: () => state.msg({
      next() {}
    }),
  }));
});

testType(() => {
  // It should be fine to construct a child type with messages, and have the parent ignore them
  type ChildMessages = {
    next(a: string): void,
  };
  const Inner = create.transition<never, ChildMessages>().build(state => state.build({
    messages: () => state.msg({
      next() {},
    })
  }));

  create.transition().build(state => state.build({
    children: {
      inner: state.child().build({
        initial: "Inner",
        states: { Inner },
      }),
    },
    messages: () => state.msg({
      next() {}
    }),
  }));
});

testType(() => {
  // It should be an error to have props that mismatch with the parent props
  type ChildProps = {
    msg: number,
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
      }),
    },
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should be an error to have props that do not contain the parent props; it would result in
  // invalid start() calls to the child
  type ChildProps = {
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
      }),
    },
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should be an error to have static props that override the parent props; start() calls should
  // only accept dynamic props, and if you set a static prop and try to pass it in, the compiler
  // should error out
  type Props = {
    msg: string,
  };

  const Inner = create.transition<never, {}, Props>().build();
  create.transition<never, {}, Props>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, Props>().build({
        initial: 'Inner',
        states: { Inner },
        props: {
          msg: "hi",
        },
      }),
    },
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should be allowed to have child props that are larger than the parent props, if all the
  // extra props are passed in as static props
  type ChildProps = {
    msg: string,
    print: boolean,
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
        props: {
          print: true,
        },
      }),
    },
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should be an error to have child props that are larger than the parent props, if those props
  // are not set as static props in the machine constructor (because otherwise they will never get
  // set).
  type ChildProps = {
    msg: string,
    print: boolean,
  };
  type ParentProps = {
    msg: string,
  };

  const Inner = create.transition<never, {}, ChildProps>().build();
  create.transition<never, {}, ParentProps>().build(state => state.build({
    children: {
      // @ts-expect-error
      inner: state.child<{}, ChildProps>().build({
        initial: 'Inner',
        states: { Inner },
      }),
    },
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should be allowed to have middleware that responds to a superset of messages and the same
  // props

  type MiddlewareMessages = {
    print(): void,
    save(): void,
  };

  type Props = {
    id: string,
    firstName: string,
  };
  type Messages = {
    save(): void,
  };

  const Middleware = create.transition<never, MiddlewareMessages, Props>().build(state => {
    return state.build({
      messages: () => state.msg({
        print() {
          console.log(state.props);
        },
        save() {
        },
      }),
    });
  });

  create.transition<
    never, Messages, Props
  >().middleware({ Middleware }).build(state => state.build({
    messages: () => state.msg({
      save() {
        console.log('saving...', state.props.id, state.props.firstName);
      }
    }),
  }));
});

testType(() => {
  // It should be allowed to have middleware that responds to a subset of messages and a subset of
  // props

  type MiddlewareProps = {
    id: string,
  };
  type MiddlewareMessages = {
    print(): void,
  };

  type Props = MiddlewareProps & {
    firstName: string,
  };
  type Messages = MiddlewareMessages & {
    save(): void,
  };

  const Middleware = create.transition<never, MiddlewareMessages, MiddlewareProps>().build(state => {
    return state.build({
      messages: () => state.msg({
        print() {
          console.log(state.props);
        }
      }),
    });
  });

  create.transition<
    never, Messages, Props
  >().middleware({ Middleware }).build(state => state.build({
    messages: () => state.msg({
      print() {
        console.log("printing first name:", state.props.firstName);
      },
      save() {
        console.log('saving...', state.props.id, state.props.firstName);
      }
    }),
  }));
});

testType(() => {
  // It should be an error to have middleware that responds to a superset of props

  type Props = {
    id: string,
  };
  type MiddlewareProps = Props & {
    firstName: string,
  };

  type Messages = {
    print(): void,
    save(): void,
  };

  const Middleware = create.transition<never, Messages, MiddlewareProps>().build(state => {
    return state.build({
      messages: () => state.msg({
        print() {
          console.log(state.props);
        },
        save() {},
      }),
    });
  });

  create.transition<
    never, Messages, Props
    //@ts-expect-error
  >().middleware({ Middleware }).build(state => state.build({
    messages: () => state.msg({
      print() {},
      save() {
        console.log('saving...', state.props.id);
      }
    }),
  }));
});

testType(() => {
  // It should be allowed to have middleware that transitions to a subset of states
  type MiddlewareTransition = "Next";
  type AllTransitions = MiddlewareTransition | "Final";

  const Middleware = create.transition<MiddlewareTransition>().build();
  create.transition<AllTransitions>().middleware({ Middleware }).build();
});

testType(() => {
  // It should be banned to have middleware that transitions to a superset of states
  type AllTransitions = "Final";
  type MiddlewareTransition = AllTransitions | "Next";

  const Middleware = create.transition<MiddlewareTransition>().build();
  //@ts-expect-error
  create.transition<AllTransitions>().middleware({ Middleware }).build();
});

testType(() => {
  // It should be allowed to have multiple calls to .middleware with hashes of different keys
  const A = create.transition().build();
  const B = create.transition().build();

  create.transition().middleware({ A }).middleware({ B }).build();
});

testType(() => {
  // It should be banned to have multiple calls to .middleware with hashes of the same keys
  const A = create.transition().build();

  //@ts-expect-error
  create.transition().middleware({ A }).middleware({ A });
});

testType(() => {
  // It should be allowed to specify props the machine doesn't provide, as long as middleware
  // provides those props
  const Middleware = create.transition().build(state => state.build({
    messages: () => state.msg({}),
    props: {
      msg: "hello",
    },
  }));

  const State = create.transition<
    never, {}, { msg: string }
  >().middleware({ Middleware }).build(state => state.build({
    messages: () => state.msg({}),
  }));

  create.machine<{}, {}>().build({
    initial: "State",
    states: { State },
  });
});

testType(() => {
  // It should be allowed to specify props the machine doesn't provide split across multiple
  // middlewares
  const A = create.transition().build(state => state.build({
    messages: () => state.msg({}),
    props: {
      msg: "hello",
    },
  }));

  const B = create.transition().build(state => state.build({
    messages: () => state.msg({}),
    props: {
      log: true,
    },
  }));

  type Props = {
    msg: string,
    log: boolean,
  };

  const State = create.transition<
    never, {}, Props
  >().middleware({ A, B }).build(state => state.build({
    messages: () => state.msg({}),
  }));

  create.machine<{}, {}>().build({
    initial: "State",
    states: { State },
  });
});

testType(() => {
  // It should be banned to use middleware that provides props that mismatch your own props
  const Middleware = create.transition().build(state => state.build({
    messages: () => state.msg({}),
    props: {
      msg: 5,
    },
  }));

  create.transition<
    never, {}, { msg: string }
  // @ts-expect-error
  >().middleware({ Middleware }).build(state => state.build({
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should be allowed to ignore messages that your middleware responds to
  type Messages = {
    update(): void,
  };

  const Middleware = create.transition<never, Messages>().build(state => state.build({
    messages: () => state.msg({
      update() {}
    }),
  }));

  create.transition<
    "Somewhere", Messages
  >().middleware({ Middleware }).build(state => state.build({
    messages: () => state.msg({}),
  }));
});

testType(() => {
  // It should be allowed to respond to messages defined by your middleware if you define them too
  type Messages = {
    update(): void,
  };
  const Middleware = create.transition<never, Messages>().build(state => state.build({
    messages: () => state.msg({
      update() {}
    }),
  }));
  create.transition<
    "Somewhere", Messages
  >().middleware({ Middleware }).build(state => state.build({
    messages: () => state.msg({
      update() {}
    }),
  }));
});
