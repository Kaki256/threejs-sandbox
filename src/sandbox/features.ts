import { parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js';
import ts from 'typescript';
import { compileSandbox } from './compiler';
import type { FeatureRecipe } from './feature-recipes';
import { featureLocation, mountedBody } from './sections';

export interface FeatureRange { start: number; end: number; label: string }
type FeatureResult = { kind: 'applied' | 'existing'; source: string; ranges: FeatureRange[] }
  | { kind: 'error'; message: string };

function findNode<T extends ts.Node>(node: ts.Node, predicate: (node: ts.Node) => node is T): T | undefined {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => findNode(child, predicate));
}
function calls(node: ts.Node, owner: string, method: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === owner && node.expression.name.text === method;
}
function statementOf(node: ts.Node): ts.Node {
  if (ts.isStatement(node) || !node.parent) return node;
  return statementOf(node.parent);
}
function importBindings(node: ts.ImportDeclaration) {
  const clause = node.importClause;
  const result = clause?.name ? [{ local: clause.name.text, imported: 'default', typeOnly: clause.isTypeOnly }] : [];
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) result.push({ local: bindings.name.text, imported: '*', typeOnly: clause?.isTypeOnly ?? false });
  else if (bindings) result.push(...bindings.elements.map(item => ({ local: item.name.text, imported: (item.propertyName ?? item.name).text, typeOnly: Boolean(clause?.isTypeOnly || item.isTypeOnly) })));
  return result;
}

// Insert into the actual Vue/TypeScript structure, retaining every untouched byte (including STL data).
export function applyFeature(source: string, recipe: FeatureRecipe): FeatureResult {
  try {
    const parsed = parse(source, { filename: 'Sandbox.vue' });
    const script = parsed.descriptor.scriptSetup;
    if (parsed.errors.length || !script || script.src) throw new Error('構文エラーを直し、<script setup lang="ts"> のコードで試してください。');
    const ast = ts.createSourceFile('Sandbox.ts', script.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const offset = script.loc.start.offset;
    const content = script.content;
    if (recipe.kind === 'orbit') {
      const existing = findNode(ast, (node): node is ts.NewExpression => ts.isNewExpression(node)
        && (ts.isIdentifier(node.expression) ? node.expression.text === 'OrbitControls'
          : ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'OrbitControls'));
      if (existing) {
        const statement = statementOf(existing);
        return { kind: 'existing', source, ranges: [{ start: offset + statement.getStart(ast), end: offset + statement.end, label: '導入済みの視点移動' }] };
      }
    }
    const body = mountedBody(ast);
    if (!body) throw new Error('追加先の onMounted(() => { … }) が見つかりません。スターターの構成で試してください。');
    const variables = new Set(body.statements.flatMap(statement => ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.flatMap(item => ts.isIdentifier(item.name) ? [item.name.text] : []) : []));
    const three = ast.statements.some(statement => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      && ['three', 'three/webgpu'].includes(statement.moduleSpecifier.text) && statement.importClause?.namedBindings
      && ts.isNamespaceImport(statement.importClause.namedBindings) && statement.importClause.namedBindings.name.text === 'THREE');
    const dispose = body.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === 'dispose');
    if (!three || !variables.has('scene') || !variables.has('camera') || !variables.has('renderer') || !dispose?.body) {
      throw new Error('追加には THREE・scene・camera・renderer と dispose() が必要です。スターターと同じ名前・構成で試してください。');
    }
    const identifiers = new Set<string>();
    function collect(node: ts.Node) { if (ts.isIdentifier(node)) identifiers.add(node.text); ts.forEachChild(node, collect); }
    collect(ast);
    let number = 1;
    while ([...identifiers].some(name => name.startsWith(`addedFeature${number}`))) number++;
    const name = `addedFeature${number}`;
    const code = (value: string) => value.trim().replaceAll('__id__', name);
    const edits: { start: number; text: string; label: string }[] = [];
    function lineStart(position: number) { return content.lastIndexOf('\n', position - 1) + 1; }
    function insertBefore(node: ts.Node, value: string, label: string) {
      if (!value.trim()) return;
      const start = lineStart(node.getStart(ast));
      // Compact/formatted code can share a line; use the statement position in that case.
      const prefix = content.slice(start, node.getStart(ast));
      const ownLine = /^\s*$/.test(prefix);
      const indentation = ownLine ? prefix : '  ';
      const text = `// ${recipe.title.replaceAll(/[\r\n]/g, ' ')} · ${label}\n${code(value)}`.split('\n').map(line => indentation + line).join('\n') + '\n';
      edits.push({ start: offset + (ownLine ? start : node.getStart(ast)), text: (ownLine ? '' : '\n') + text, label });
    }
    const location = featureLocation(body, recipe.target);
    insertBefore(location?.next ?? dispose, recipe.setup, '初期化');
    if (recipe.cleanup.trim()) {
      edits.push({ start: offset + dispose.body.getStart(ast) + 1,
        text: `\n${code(recipe.cleanup).split('\n').map(line => `    ${line}`).join('\n')}\n`, label: '後片付け' });
    }
    if (recipe.frame.trim()) {
      const loop = findNode(body, (node): node is ts.CallExpression => calls(node, 'renderer', 'setAnimationLoop'));
      const render = loop && findNode(loop, (node): node is ts.CallExpression => calls(node, 'renderer', 'render'));
      if (!render) throw new Error('毎フレーム処理の追加先 renderer.setAnimationLoop / renderer.render が見つかりません。');
      insertBefore(statementOf(render), recipe.frame, '毎フレーム');
    }
    if (recipe.imports.trim()) {
      const imports = ts.createSourceFile('Imports.ts', code(recipe.imports), ts.ScriptTarget.Latest, true);
      const currentImports = ast.statements.filter(ts.isImportDeclaration);
      const lines: string[] = [];
      for (const statement of imports.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) throw new Error('import 欄には import 文だけを記述してください。');
        const bindings = importBindings(statement);
        const moduleName = statement.moduleSpecifier.text;
        const existing = currentImports.find(item => ts.isStringLiteral(item.moduleSpecifier) && item.moduleSpecifier.text === moduleName
          && statement.getText(imports).replaceAll(/\s/g, '') === item.getText(ast).replaceAll(/\s/g, ''));
        if (existing) continue;
        if (bindings.length && bindings.every(binding => currentImports.some(item => ts.isStringLiteral(item.moduleSpecifier) && item.moduleSpecifier.text === moduleName
          && importBindings(item).some(current => current.local === binding.local && current.imported === binding.imported && (!current.typeOnly || binding.typeOnly))))) continue;
        if (bindings.some(binding => identifiers.has(binding.local))) throw new Error('import する名前が既存コードと重なっています。既存の import を使うか別名にしてください。');
        bindings.forEach(binding => identifiers.add(binding.local));
        lines.push(statement.getText(imports));
      }
      if (lines.length) edits.push({ start: offset, text: '\n' + lines.join('\n') + '\n', label: 'import' });
    }
    let result = '';
    let cursor = 0;
    const ranges: FeatureRange[] = [];
    for (const edit of edits.sort((a, b) => a.start - b.start)) {
      result += source.slice(cursor, edit.start);
      const start = result.length;
      result += edit.text;
      ranges.push({ start, end: result.length, label: edit.label });
      cursor = edit.start;
    }
    result += source.slice(cursor);
    const compiled = compileSandbox(result);
    if (compiled.kind === 'error') throw new Error(`追加を見送りました。${compiled.issue.message}`);
    ranges.sort((a, b) => (a.label === '初期化' ? -1 : b.label === '初期化' ? 1 : a.start - b.start));
    return { kind: 'applied', source: result, ranges };
  } catch (error) { return { kind: 'error', message: error instanceof Error ? error.message : String(error) }; }
}
