export function createBridgeBlueprint() {
  return {
    ide: 'planned',
    remote: 'ready',
    mobile: 'planned',
    web: 'ready',
  };
}

export { createHttpBridge } from './http.js';
