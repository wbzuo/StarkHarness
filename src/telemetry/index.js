export function createTelemetrySink() {
  return {
    emit(eventName, payload) {
      return { eventName, payload, sink: 'noop' };
    },
  };
}
