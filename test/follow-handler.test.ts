import { vi, expect, it, describe, beforeEach } from "vitest";
import { EventEmitter } from "../src/event-emitter";
import { FollowHandler } from "../src/follow-handler";

describe("On/off emitters", () => {
  type EventMapping = {
    hello: string,
  };
  type Should = {
    emitter: EventEmitter<EventMapping>,
    follow: FollowHandler,
  };
  beforeEach<Should>(ctx => {
    ctx.emitter = new EventEmitter();
    ctx.follow = new FollowHandler();
  });

  it<Should>("follow events from the emitter", ({ emitter, follow }) => {
    const spy = follow.on(emitter, "hello", vi.fn());
    emitter.emit("hello", "world");
    expect(spy).toHaveBeenCalledWith("world");
  });

  it<Should>("deregister after once calls", ({ emitter, follow }) => {
    const spy = vi.fn();
    follow.once(emitter, "hello", spy);
    emitter.emit("hello", "world");
    emitter.emit("hello", "world2");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("world");
  });

  it<Should>("not deregister after repeated on calls", ({ emitter, follow }) => {
    const spy = vi.fn();
    follow.on(emitter, "hello", spy);
    emitter.emit("hello", "world");
    expect(spy).toHaveBeenCalledWith("world");
    emitter.emit("hello", "world2");
    expect(spy).toHaveBeenCalledWith("world2");
  });

  it<Should>("deregister after explicit off calls", ({ emitter, follow }) => {
    const spy = vi.fn();
    follow.on(emitter, "hello", spy);
    emitter.emit("hello", "world");
    follow.off(emitter, "hello", spy);
    emitter.emit("hello", "world2");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("world");
  });

  it<Should>("be possible to deregister the return value of once calls", ({ emitter, follow }) => {
    const spy = vi.fn();
    const handler = follow.once(emitter, "hello", spy);
    follow.off(emitter, "hello", handler);
    emitter.emit("hello", "world");
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it<Should>("remove all handlers after a clear call", ({ emitter, follow }) => {
    const spy = vi.fn();
    follow.on(emitter, "hello", spy);
    follow.once(emitter, "hello", spy);
    follow.clear();
    emitter.emit("hello", "world");
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe("DOM style event handlers", () => {
  class DomStyle {
    readonly handlers: Array<(data: string) => any> = [];

    addEventListener(_: "test", handler: (data: string) => any) {
      this.handlers.push(handler);
      return handler;
    }

    removeEventListener(_: "test", handler: (data: string) => any) {
      for(let i = 0; i < this.handlers.length; i++) {
        if(this.handlers[i] === handler) {
          this.handlers.splice(i, 1);
          return true;
        }
      }
      return false;
    }

    emit(_: "test", data: string) {
      this.handlers.forEach(handler => handler(data));
    }
  }

  type Should = {
    emitter: DomStyle,
    follow: FollowHandler,
  };

  beforeEach<Should>(ctx => {
    ctx.emitter = new DomStyle();
    ctx.follow = new FollowHandler();
  });

  it<Should>("proxy on calls to addEventListener", ({ emitter, follow }) => {
    const spy = follow.on(emitter, "test", vi.fn());
    emitter.emit("test", "world");
    expect(spy).toHaveBeenCalledWith("world");
  });

  it<Should>("proxy off calls to removeEventListener", ({ emitter, follow }) => {
    const spy = follow.on(emitter, "test", vi.fn());
    follow.off(emitter, "test", spy);
    emitter.emit("test", "world");
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
