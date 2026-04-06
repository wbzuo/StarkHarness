import ts from 'typescript';
import path from 'node:path';

function flattenMessage(messageText) {
  return typeof messageText === 'string'
    ? messageText
    : ts.flattenDiagnosticMessageText(messageText, '\n');
}

export function getFileDiagnostics(filePath, { cwd = process.cwd() } = {}) {
  const abs = path.resolve(cwd, filePath);
  const options = {
    allowJs: true,
    checkJs: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  };
  const program = ts.createProgram([abs], options);
  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].filter((diag) => diag.file?.fileName === abs);

  return diagnostics.map((diag) => {
    const start = diag.start ?? 0;
    const lineChar = diag.file?.getLineAndCharacterOfPosition(start) ?? { line: 0, character: 0 };
    return {
      file: abs,
      line: lineChar.line + 1,
      column: lineChar.character + 1,
      code: diag.code,
      category: ts.DiagnosticCategory[diag.category].toLowerCase(),
      message: flattenMessage(diag.messageText),
    };
  });
}

export function searchWorkspaceSymbols(rootDir, query) {
  const files = ts.sys.readDirectory(rootDir, ['.ts', '.tsx', '.js', '.jsx'], undefined, undefined);
  const symbols = [];
  for (const file of files) {
    const source = ts.sys.readFile(file);
    if (!source) continue;
    const regex = new RegExp(`\\b(class|function|const|let|var|interface|type)\\s+(${query})`, 'ig');
    let match;
    while ((match = regex.exec(source))) {
      const before = source.slice(0, match.index);
      const line = before.split('\n').length;
      symbols.push({
        file,
        line,
        kind: match[1],
        name: match[2],
      });
    }
  }
  return symbols;
}
