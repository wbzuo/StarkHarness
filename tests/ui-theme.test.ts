import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bold, dim, cyan, green, yellow, red, gray,
  FIGURES, SPINNER_FRAMES, createSpinner,
  renderBox, stripAnsi,
  boldCyan, dimGray,
} from '../src/ui/theme.js';

test('color functions wrap text with ANSI codes', () => {
  assert.ok(bold('hello').includes('\x1b[1m'));
  assert.ok(bold('hello').includes('\x1b[0m'));
  assert.ok(cyan('hello').includes('\x1b[36m'));
  assert.ok(red('hello').includes('\x1b[31m'));
  assert.ok(green('hello').includes('\x1b[32m'));
  assert.ok(yellow('hello').includes('\x1b[33m'));
  assert.ok(dim('hello').includes('\x1b[2m'));
  assert.ok(gray('hello').includes('\x1b[90m'));
});

test('stripAnsi removes ANSI escape codes', () => {
  assert.equal(stripAnsi(bold(cyan('hello'))), 'hello');
  assert.equal(stripAnsi(red('error') + green(' ok')), 'error ok');
  assert.equal(stripAnsi('plain text'), 'plain text');
});

test('FIGURES contains expected glyphs', () => {
  assert.ok(FIGURES.tick);
  assert.ok(FIGURES.cross);
  assert.ok(FIGURES.pointer);
  assert.ok(FIGURES.corner);
  assert.ok(FIGURES.line);
  assert.ok(FIGURES.bullet);
  assert.ok(FIGURES.ellipsis);
  assert.ok(FIGURES.arrowRight);
});

test('SPINNER_FRAMES is a non-empty array', () => {
  assert.ok(Array.isArray(SPINNER_FRAMES));
  assert.ok(SPINNER_FRAMES.length >= 8);
});

test('createSpinner returns start/stop/update interface', () => {
  const spinner = createSpinner('test');
  assert.equal(typeof spinner.start, 'function');
  assert.equal(typeof spinner.stop, 'function');
  assert.equal(typeof spinner.update, 'function');
});

test('renderBox produces bordered output', () => {
  const box = renderBox('Title', 'line1\nline2');
  assert.ok(box.includes('Title'));
  assert.ok(box.includes('line1'));
  assert.ok(box.includes('line2'));
  // Should have top and bottom borders
  assert.ok(box.includes('\u256d')); // ╭
  assert.ok(box.includes('\u256f')); // ╯
});

test('boldCyan and dimGray compose correctly', () => {
  const result = boldCyan('test');
  assert.ok(result.includes('\x1b[1m'));
  assert.ok(result.includes('\x1b[36m'));
  assert.equal(stripAnsi(result), 'test');

  const result2 = dimGray('test');
  assert.ok(result2.includes('\x1b[2m'));
  assert.ok(result2.includes('\x1b[90m'));
});
