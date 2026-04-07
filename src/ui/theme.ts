// ANSI color helpers — zero-dependency chalk alternative for StarkHarness TUI.
// Inspired by claude-code-best's chalk-based rendering but implemented with
// raw ANSI escape codes to keep the harness dependency-free.

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

function wrap(code, text) {
  return `${ESC}${code}m${text}${RESET}`;
}

// Foreground colors
export const bold = (t) => wrap('1', t);
export const dim = (t) => wrap('2', t);
export const italic = (t) => wrap('3', t);
export const underline = (t) => wrap('4', t);

export const red = (t) => wrap('31', t);
export const green = (t) => wrap('32', t);
export const yellow = (t) => wrap('33', t);
export const blue = (t) => wrap('34', t);
export const magenta = (t) => wrap('35', t);
export const cyan = (t) => wrap('36', t);
export const white = (t) => wrap('37', t);
export const gray = (t) => wrap('90', t);

// Bright variants
export const brightRed = (t) => wrap('91', t);
export const brightGreen = (t) => wrap('92', t);
export const brightYellow = (t) => wrap('93', t);
export const brightBlue = (t) => wrap('94', t);
export const brightMagenta = (t) => wrap('95', t);
export const brightCyan = (t) => wrap('96', t);

// Background
export const bgRed = (t) => wrap('41', t);
export const bgGreen = (t) => wrap('42', t);
export const bgYellow = (t) => wrap('43', t);
export const bgBlue = (t) => wrap('44', t);

// Composable
export const boldCyan = (t) => bold(cyan(t));
export const boldGreen = (t) => bold(green(t));
export const boldRed = (t) => bold(red(t));
export const boldYellow = (t) => bold(yellow(t));
export const dimGray = (t) => dim(gray(t));

// Figures (unicode glyphs like in claude-code's figures package)
export const FIGURES = {
  tick: '\u2714',       // ✔
  cross: '\u2718',      // ✘
  bullet: '\u25cf',     // ●
  ellipsis: '\u2026',   // …
  pointer: '\u276f',    // ❯
  line: '\u2500',       // ─
  corner: '\u23bf',     // ⎿  (claude-code response indicator)
  info: '\u2139',       // ℹ
  warning: '\u26a0',    // ⚠
  arrowRight: '\u2192', // →
  arrowDown: '\u2193',  // ↓
  star: '\u2605',       // ★
  sparkle: '\u2728',    // ✨
  gear: '\u2699',       // ⚙
  lock: '\u1f512',      // 🔒
};

// Spinner frames (like claude-code's Spinner component)
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function createSpinner(label = 'Thinking') {
  let frame = 0;
  let timer = null;
  const stream = process.stderr;

  function render() {
    const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    stream.write(`\r${ESC}2K${cyan(glyph)} ${dim(label)}`);
    frame += 1;
  }

  return {
    start() {
      frame = 0;
      render();
      timer = setInterval(render, 80);
    },
    stop(finalMessage) {
      if (timer) clearInterval(timer);
      timer = null;
      stream.write(`\r${ESC}2K`);
      if (finalMessage) stream.write(`${finalMessage}\n`);
    },
    update(newLabel) {
      label = newLabel;
    },
  };
}

// Box drawing for panels (like Ink's Box component)
export function renderBox(title, content, { width = 60 } = {}) {
  const topLeft = '\u256d';     // ╭
  const topRight = '\u256e';    // ╮
  const bottomLeft = '\u2570';  // ╰
  const bottomRight = '\u256f'; // ╯
  const horizontal = '\u2500';  // ─
  const vertical = '\u2502';    // │

  const innerWidth = width - 2;
  const titleStr = title ? ` ${title} ` : '';
  const titleLen = stripAnsi(titleStr).length;
  const topBar = `${topLeft}${horizontal}${boldCyan(titleStr)}${horizontal.repeat(Math.max(0, innerWidth - titleLen - 1))}${topRight}`;
  const bottomBar = `${bottomLeft}${horizontal.repeat(innerWidth)}${bottomRight}`;

  const lines = content.split('\n').map((line) => {
    const visible = stripAnsi(line).length;
    const pad = Math.max(0, innerWidth - visible);
    return `${vertical} ${line}${' '.repeat(pad)}${vertical}`;
  });

  return [topBar, ...lines, bottomBar].join('\n');
}

// Strip ANSI codes for length calculation
export function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
