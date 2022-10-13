/*
 * Event system
 * =================================================================================================
 *
 * A typed, generic event system, supporting a stripped-down version of the NodeJS EventEmitter API.
 *
 * You must tell the type system ahead of time what events you plan on emitting, and what data the
 * callbacks for those events take.
 */

export type EventNameToDataMapping = { [key: string]: any };
export class EventEmitter<Mapping extends EventNameToDataMapping> {
  private listeners: Partial<{ [K in keyof Mapping]: Array<(input: Mapping[K]) => any> }> = {};

  // Register a callback for an event
  on<K extends keyof Mapping>(event: K, cb: (input: Mapping[K]) => any) {
    this.ensureKeyExists(event).push(cb);
    return cb;
  }

  // Unregister a callback for an event. Returns true if it was unregistered, false if it was never
  // registered in the first place
  off<K extends keyof Mapping>(event: K, cb: (input: Mapping[K]) => any) {
    const listeners = this.ensureKeyExists(event);
    const index = listeners.indexOf(cb);
    if(index < 0) return false;
    listeners.splice(index, 1);
    return true;
  }

  // Register a callback that runs a single time before unregistering itself
  once<K extends keyof Mapping>(event: K, cb: (input: Mapping[K]) => any) {
    const wrapped = (input: Mapping[K]) => {
      cb(input);
      this.off(event, wrapped);
    };
    return this.on(event, wrapped);
  }

  // Remove all callbacks from this EventEmitter
  clear() {
    for(const key in this.listeners) {
      this.listeners[key] = [];
    }
  }

  // Emit an event
  emit<Ev extends keyof Mapping>(event: Ev, data: Mapping[Ev]) {
    for(const listener of this.ensureKeyExists(event)) {
      listener(data);
    }
  }

  // Utility function to ensure that keys always translate to callback arrays
  private ensureKeyExists<K extends keyof Mapping>(k: K): Array<(input: Mapping[K]) => any> {
    let listeners = this.listeners[k];
    if(!listeners) {
      listeners = [];
      this.listeners[k] = listeners;
    }
    return listeners;
  }
}
