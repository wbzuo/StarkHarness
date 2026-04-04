export function createCommandRegistry() {
  return [
    { name: 'blueprint', description: 'Print module blueprint' },
    { name: 'doctor', description: 'Validate harness wiring' },
    { name: 'run', description: 'Execute a sample harness turn' },
  ];
}
