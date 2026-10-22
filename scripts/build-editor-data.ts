import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { apiGuides } from '../src/sandbox/editor/api-guides';
import { isRecord } from '../src/sandbox/protocol';

const root = resolve(import.meta.dirname, '..');
const files: Record<string, string> = {};
const versions: Record<string, string> = {};
const visited = new Set<string>();

async function collectPackage(name: string) {
  if (visited.has(name)) return;
  visited.add(name);
  const directory = join(root, 'node_modules', name);
  const manifest: unknown = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (!isRecord(manifest) || typeof manifest.version !== 'string') throw new Error(`Invalid package: ${name}`);
  versions[name] = manifest.version;
  await collectFiles(directory, `/node_modules/${name}`);
  if (isRecord(manifest.dependencies)) for (const dependency of Object.keys(manifest.dependencies)) await collectPackage(dependency);
}

async function collectFiles(directory: string, virtual: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const actual = join(directory, entry.name);
    const path = `${virtual}/${entry.name}`;
    if (entry.isDirectory()) await collectFiles(actual, path);
    else if (/\.d\.[cm]?ts$/.test(entry.name) || /^licen[cs]e(?:[.-].*)?$/i.test(entry.name) || entry.name === 'package.json') files[path] = await readFile(actual, 'utf8');
  }
}

for (const name of ['typescript', 'vue', 'three', '@types/three']) await collectPackage(name);
await collectFiles(join(root, 'node_modules/@vue/language-core/types'), '/node_modules/@vue/language-core/types');
for (const guide of apiGuides) {
  const path = guide.declaration.file;
  const original = files[path];
  if (original === undefined) throw new Error(`Missing documentation source: ${path}`);
  const source = ts.createSourceFile(path, original, ts.ScriptTarget.Latest, true);
  const positions = new Set<number>();
  function visit(node: ts.Node) {
    const owner = guide.declaration.kind === 'method' ? guide.declaration.owner : guide.name;
    if (ts.isClassDeclaration(node) && node.name?.text === owner) {
      if (guide.declaration.kind === 'constructor') positions.add(node.getStart(source));
      for (const member of node.members) {
        if (guide.declaration.kind === 'constructor' && ts.isConstructorDeclaration(member)) positions.add(member.getStart(source));
        if (guide.declaration.kind === 'method' && member.name && ts.isIdentifier(member.name) && member.name.text === guide.name) positions.add(member.getStart(source));
      }
    }
    if (guide.declaration.kind === 'function') {
      if (ts.isFunctionDeclaration(node) && node.name?.text === guide.name) positions.add(node.getStart(source));
      if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === guide.name)) positions.add(node.getStart(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!positions.size) throw new Error(`Documentation target not found: ${guide.name}`);
  const comment = `/**\n * ${guide.summary}\n${guide.parameters.map(parameter => ` * @param ${parameter.name} ${parameter.description}${parameter.defaultValue ? ` 初期値: ${parameter.defaultValue}` : ''}\n`).join('')} */\n`;
  let result = original;
  for (const position of [...positions].sort((a, b) => b - a)) result = result.slice(0, position) + comment + result.slice(position);
  files[path] = result;
}
const output = join(root, 'public/sandbox-editor-types.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ files, versions }));
const declarations = Object.keys(files).filter(path => /\.d\.[cm]?ts$/.test(path)).length;
console.log(`Editor: ${declarations} local declarations (Vue ${versions.vue}, Three.js ${versions.three}, TypeScript ${versions.typescript})`);
