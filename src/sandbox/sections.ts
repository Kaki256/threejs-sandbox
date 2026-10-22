import { parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js';
import ts from 'typescript';
import type { CodeSection, FeatureTarget, SectionKind } from './section-guide';

export function mountedBody(ast: ts.SourceFile) {
  const statement = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'onMounted');
  const callback = statement && ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) ? statement.expression.arguments[0] : undefined;
  return callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body) ? callback.body : undefined;
}
function identifiers(node: ts.Node): string[] {
  const result: string[] = [];
  function walk(child: ts.Node) { if (ts.isIdentifier(child)) result.push(child.text); ts.forEachChild(child, walk); }
  walk(node);
  return result;
}
function newRole(node: ts.Node): SectionKind | undefined {
  if (ts.isNewExpression(node)) {
    const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
    if (name.endsWith('Camera') || name === 'OrbitControls') return 'camera';
    if (name.endsWith('Renderer') || name === 'Scene') return 'stage';
    if (/Geometry$|Material$|Light$|^(Mesh|Group|Object3D|Vector3|Box3|STLLoader|GridHelper|AxesHelper)$/.test(name)) return 'items';
  }
  return ts.forEachChild(node, newRole);
}
function statementRole(node: ts.Statement, bindings: Map<string, SectionKind>): SectionKind {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'dispose') return 'cleanup';
  if (ts.isTryStatement(node)) return 'lifecycle';
  if (ts.isExpressionStatement(node)) {
    const expression = node.expression;
    if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
      && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === 'scene' && ['add', 'remove', 'traverse'].includes(expression.expression.name.text)) return 'items';
    const root = identifiers(expression)[0];
    if (root && ['camera', 'controls', 'resetCamera'].includes(root)) return 'camera';
    if (root && ['renderer', 'scene'].includes(root)) return 'stage';
    if (root && bindings.has(root)) return bindings.get(root) ?? 'lifecycle';
  }
  const created = newRole(node);
  if (created) return created;
  const dependencies = identifiers(node).map(name => bindings.get(name));
  if (dependencies.includes('items')) return 'items';
  if (dependencies.includes('camera')) return 'camera';
  return 'lifecycle';
}
function setupStatements(body: ts.Block) {
  const bindings = new Map<string, SectionKind>([['renderer', 'stage'], ['scene', 'stage'], ['camera', 'camera'], ['controls', 'camera'], ['resetCamera', 'camera']]);
  return body.statements.map(statement => {
    const kind = statementRole(statement, bindings);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) bindings.set(declaration.name.text, kind);
    }
    return { statement, kind };
  });
}

// The editor headers and code insertion share exactly the same target.
export function featureLocation(body: ts.Block, target: FeatureTarget) {
  const statements = setupStatements(body);
  const disposeIndex = statements.findIndex(({ statement }) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'dispose');
  if (disposeIndex < 0) return;
  let readyIndex = -1;
  statements.forEach(({ statement }, index) => {
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && ['scene', 'camera', 'renderer'].includes(declaration.name.text))) readyIndex = index;
  });
  let previous: ts.Statement | undefined;
  let next: ts.Statement | undefined;
  for (let i = readyIndex; i < disposeIndex; i++) {
    const entry = statements[i];
    if (entry?.kind === target) { previous = entry.statement; next = statements[i + 1]?.statement; }
  }
  return { previous, next: next ?? statements[disposeIndex]?.statement };
}

export function analyzeSections(source: string): CodeSection[] {
  const parsed = parse(source, { filename: 'Sandbox.vue' });
  const lines = source.split('\n');
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const roles: (SectionKind | undefined)[] = Array.from({ length: lines.length });
  function lineAt(offset: number) {
    let low = 0, high = starts.length;
    while (low + 1 < high) { const mid = Math.floor((low + high) / 2); if ((starts[mid] ?? 0) <= offset) low = mid; else high = mid; }
    return low;
  }
  function assign(start: number, end: number, kind: SectionKind) {
    for (let line = lineAt(start); line <= lineAt(Math.max(start, end - 1)); line++) roles[line] = kind;
  }
  const script = parsed.descriptor.scriptSetup ?? parsed.descriptor.script;
  const targets: { target: FeatureTarget; line: number; empty: boolean }[] = [];
  if (script) {
    const content = script.content;
    const offset = script.loc.start.offset;
    assign(offset, script.loc.end.offset, 'settings');
    const ast = ts.createSourceFile('Sandbox.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    function assignNode(node: ts.Node, kind: SectionKind) {
      const comments = ts.getLeadingCommentRanges(content, node.getFullStart());
      const begin = comments?.[0]?.pos ?? node.getStart(ast);
      assign(offset + begin, offset + node.end, kind);
    }
    const body = mountedBody(ast);
    for (const statement of ast.statements) {
      if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && ts.isIdentifier(statement.expression.expression)) {
        if (statement.expression.expression.text === 'onMounted') assignNode(statement, 'lifecycle');
        if (statement.expression.expression.text === 'onUnmounted') assignNode(statement, 'cleanup');
      }
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'stlBase64')) assignNode(statement, 'data');
    }
    if (body) {
      for (const { statement, kind } of setupStatements(body)) assignNode(statement, kind);
      function walk(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
          && node.expression.expression.text === 'renderer' && node.expression.name.text === 'setAnimationLoop') assignNode(node, 'animation');
        ts.forEachChild(node, walk);
      }
      walk(body);
      for (const target of ['items', 'camera'] satisfies FeatureTarget[]) {
        const location = featureLocation(body, target);
        const node = location?.previous ?? location?.next;
        if (node) targets.push({ target, line: lineAt(offset + node.getStart(ast)) + 1, empty: !location?.previous });
      }
    }
  }
  const template = parsed.descriptor.template;
  if (template) assign(template.loc.start.offset, template.loc.end.offset + 1, 'template');
  for (const style of parsed.descriptor.styles) assign(style.loc.start.offset, style.loc.end.offset + 1, 'style');
  const sections: CodeSection[] = [];
  lines.forEach((line, index) => {
    if ((!line.trim() || /^\s*\/\/ #endregion/.test(line)) && index > 0 && roles[index]) roles[index] = roles[index - 1];
  });
  roles.forEach((kind, index) => {
    if (!kind) return;
    const previous = sections.at(-1);
    if (previous?.kind === kind && previous.endLine === index) previous.endLine++;
    else sections.push({ kind, startLine: index + 1, endLine: index + 1, target: null });
  });
  for (const { target, line, empty } of targets) {
    const section = sections.find(section => section.kind === target && section.startLine <= line && line <= section.endLine);
    if (section && !empty) section.target = target;
    else sections.push({ kind: target, startLine: line, endLine: line - 1, target });
  }
  return sections.sort((a, b) => a.startLine - b.startLine);
}
