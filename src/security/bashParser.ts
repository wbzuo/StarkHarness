function pushToken(tokens, current) {
  if (current.value !== '') {
    tokens.push({ type: 'word', value: current.value });
    current.value = '';
  }
}

export function tokenizeBash(command = '') {
  const tokens = [];
  const current = { value: '' };
  let quote = null;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current.value += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      pushToken(tokens, current);
      continue;
    }

    const twoChar = `${char}${next ?? ''}`;
    if (['&&', '||'].includes(twoChar)) {
      pushToken(tokens, current);
      tokens.push({ type: 'operator', value: twoChar });
      index += 1;
      continue;
    }

    if (['|', ';', '(', ')'].includes(char)) {
      pushToken(tokens, current);
      tokens.push({ type: 'operator', value: char });
      continue;
    }

    current.value += char;
  }

  pushToken(tokens, current);
  return tokens;
}

export function parseBashCommand(command = '') {
  const tokens = tokenizeBash(command);
  const commands = [];
  let current = { name: null, args: [], connectors: [] };

  for (const token of tokens) {
    if (token.type === 'operator') {
      if (token.value === '(' || token.value === ')') continue;
      current.connectors.push(token.value);
      if (current.name || current.args.length > 0) {
        commands.push(current);
        current = { name: null, args: [], connectors: [] };
      }
      continue;
    }

    if (!current.name) {
      current.name = token.value;
    } else {
      current.args.push(token.value);
    }
  }

  if (current.name || current.args.length > 0) {
    commands.push(current);
  }

  return {
    tokens,
    commands,
  };
}
