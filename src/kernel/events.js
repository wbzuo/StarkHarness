export class EventBus {
  #listeners = new Map();

  on(eventName, listener) {
    const listeners = this.#listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.#listeners.set(eventName, listeners);
    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    const listeners = this.#listeners.get(eventName) ?? [];
    this.#listeners.set(
      eventName,
      listeners.filter((item) => item !== listener),
    );
  }

  emit(eventName, payload) {
    for (const listener of this.#listeners.get(eventName) ?? []) {
      listener(payload);
    }
  }
}
