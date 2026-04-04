export async function runHarnessTurn(runtime, turn) {
  runtime.events.emit('turn:start', turn);
  const result = await runtime.dispatchTurn(turn);
  runtime.events.emit('turn:end', result);
  return result;
}
