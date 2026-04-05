export function createBridgeBlueprint() {
  return {
    ide: 'planned',
    remote: 'planned',
    mobile: 'planned',
    web: 'ready',
  };
}

export { createHttpBridge } from './http.js';
