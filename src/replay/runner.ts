export function createReplayPlan(session) {
  return session.turns.map(({ turn, result }, index) => ({
    step: index + 1,
    tool: turn.tool,
    input: turn.input,
    expected: result,
  }));
}

export function evaluateReplayPlan(plan) {
  return {
    totalSteps: plan.length,
    runnableSteps: plan.filter((step) => Boolean(step.tool)).length,
    status: plan.length > 0 ? 'planned' : 'empty',
  };
}
