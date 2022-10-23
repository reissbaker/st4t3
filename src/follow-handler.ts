type Fn = (...args: any) => any;

type Emitter<Name extends string, Handler extends Fn> = {
  on(event: Name, cb: Handler): any,
  off(event: Name, cb: Handler): any,
};

type DomEmitter<Name extends string, Handler extends Fn> = {
  addEventListener(event: Name, cb: Handler): any,
  removeEventListener(event: Name, cb: Handler): any,
};

type EvSource<Name extends string, Handler extends Fn> = Emitter<Name, Handler>
                                                       | DomEmitter<Name, Handler>
                                                       ;

type Watcher<T extends EvSource<any, any>> = {
  source: T,
  event: string,
  callback: Fn,
};

type WatcherDict<T extends EvSource<any, any>> = { [key: string]: Watcher<T>[] };

export type Param0<T> = T extends (arg: infer A, ...any: any) => any ? A : never;
export type Param1<T> = T extends (a1: any, a2: infer A) => any ? A : never;

export type On<T> = T extends DomEmitter<any, any> ? T["addEventListener"] :
  T extends Emitter<any, any> ? T["on"] : never;
export type Off<T> = T extends DomEmitter<any, any> ? T["removeEventListener"] :
  T extends Emitter<any, any> ? T["off"] : never;

export class FollowHandler {
  private readonly _watched: WatcherDict<Emitter<any, any>> = {};
  private readonly _domWatched: WatcherDict<DomEmitter<any, any>> = {};

  on<T extends EvSource<any, any>>(
    emitter: T, event: Param0<On<T>>, cb: Param1<On<T>>
  ) {
    if(isDomStyle(emitter)) return this.onDomEmitter(emitter, event as string, cb);
    return this.onEmitter(emitter, event as string, cb);
  }

  off<T extends EvSource<any, any>>(
    emitter: T, event: Param0<Off<T>>, cb: Param1<Off<T>>
  ): boolean {
    if(isDomStyle(emitter)) return this.offDomEmitter(emitter, event, cb);
    return this.offEmitter(emitter, event, cb);
  }

  once<T extends EvSource<any, any>>(
    emitter: T, event: Param0<On<T>>, cb: Param1<On<T>>
  ): (...args: any) => any {
    const handler = this.on(emitter, event, ((...args: any) => {
      const ret = cb(...args);
      this.off(emitter, event, handler);
      return ret;
    }) as any);
    return handler;
  }

  clear() {
    let watchers: Watcher<any>[] = Object.values(this._watched).flat();
    watchers = watchers.concat(Object.values(this._domWatched).flat());
    for(const watcher of watchers) {
      this.off(watcher.source, watcher.event, watcher.callback);
    }
  }

  private onEmitter<Name extends string, Handler extends Fn, T extends Emitter<Name, Handler>>(
    source: T, event: Name, callback: Handler
  ) {
    const watchers = upsertArray(this._watched, event);
    watchers.push({ source, event, callback });
    source.on(event, callback);
    return callback;
  }

  private onDomEmitter<Name extends string, Handler extends Fn, T extends DomEmitter<Name, Handler>>(
    source: T, event: Name, callback: Handler
  ) {
    const watchers = upsertArray(this._domWatched, event);
    watchers.push({ source, event, callback });
    source.addEventListener(event, callback);
    return callback;
  }

  private offEmitter<Name extends string, Handler extends Fn, T extends Emitter<Name, Handler>>(
    emitter: T, name: Name, cb: Handler
  ): boolean {
    return remove(
      this._watched[name],
      watcher => watcher.source === emitter && watcher.callback === cb,
      () => emitter.off(name, cb)
    );
  }

  private offDomEmitter<Name extends string, Handler extends Fn, T extends DomEmitter<Name, Handler>>(
    emitter: T, name: Name, cb: Handler
  ): boolean {
    return remove(
      this._domWatched[name],
      watcher => watcher.source === emitter && watcher.callback === cb,
      () => emitter.removeEventListener(name, cb)
    );
  }
}

function remove<T>(
  array: Array<T> | undefined, match: (t: T) => boolean, cb: () => boolean
): boolean {
  if(array === undefined) return false;
  for(let i = 0; i < array.length; i++) {
    const watcher = array[i];
    if(match(watcher)) {
      array.splice(i, 1);
      return cb();
    }
  }
  return false;
}

function upsertArray<H extends { [key: string]: any[] }>(hash: H, name: keyof H & string) {
  if(hash[name] !== undefined) return hash[name];
  const arr = [] as unknown as H[typeof name];
  hash[name] = arr;
  return arr;
}

function isDomStyle<Name extends string, Handler extends Fn>(
  source: EvSource<Name, Handler>
): source is DomEmitter<Name, Handler> {
  const testSource = (source as Emitter<Name, Handler>);
  return testSource.on !== undefined && testSource.off !== undefined;
}
