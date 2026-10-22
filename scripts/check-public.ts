import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

function files(directory: string): string[] {
  return readdirSync(directory).flatMap(name => { const path = resolve(directory, name); return statSync(path).isDirectory() ? files(path) : [path]; });
}
const output = files(resolve('dist-public'));
assert(output.some(path => path.endsWith('/index.html')));
assert(output.some(path => path.endsWith('/sandbox-runtime.js')));
assert(output.some(path => path.endsWith('/sandbox-editor-types.json')));
const scripts = output.filter(path => /\.(?:js|html|json)$/.test(path));
for (const path of scripts) {
  const text = readFileSync(path, 'utf8');
  for (const pattern of ['ics.media', 'ICS MEDIA', 'article-section-', 'ProvidedArticle', 'ReferenceArticle', 'LessonQuickstart']) {
    assert(!text.includes(pattern), `${path}: imported article content or local article UI must not ship`);
  }
}
console.log('Public build checks passed: room playground and sandbox resources included; no imported article text, article identifiers, or article-page components.');
