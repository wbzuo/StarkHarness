// Match a user query against loaded skills and return the binding for the agent loop
export function matchAndBind(query, skillsMap) {
  const lower = query.toLowerCase();
  for (const [, skill] of skillsMap) {
    const descWords = (skill.description ?? '').toLowerCase().split(/\s+/);
    const queryWords = lower.split(/\s+/);
    const overlap = queryWords.filter((w) => descWords.includes(w) && w.length > 3).length;
    if (overlap >= 2) {
      return {
        name: skill.name,
        body: skill.body ?? '',
        promptAddendum: `\n\n# Active Skill: ${skill.name}\n\n${skill.body ?? ''}`,
      };
    }
  }
  return null;
}
