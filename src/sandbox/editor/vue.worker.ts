import { createTypeScriptWorkerLanguageService, type LanguageServiceEnvironment } from '@volar/monaco/worker';
import { createVueLanguagePlugin, getDefaultCompilerOptions } from '@vue/language-core';
import { createVueLanguageServicePlugins } from '@vue/language-service';
import { initialize } from 'monaco-editor/esm/vs/editor/editor.worker.js';
import { create as createSemanticPlugin } from 'volar-service-typescript/lib/plugins/semantic';
import ts from 'typescript';
import { URI } from 'vscode-uri';
import { createLocalFileSystem, loadLocalTypes } from './local-files';

const data = await loadLocalTypes();
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true, skipLibCheck: true, allowNonTsExtensions: true, allowJs: true, checkJs: true,
  jsx: ts.JsxEmit.Preserve, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: ['@webgpu/types', 'webxr'],
};
const vueOptions = { ...getDefaultCompilerOptions(), typesRoot: '/node_modules/@vue/language-core/types', target: 3.5 };
const env: LanguageServiceEnvironment = {
  workspaceFolders: [URI.file('/')], locale: 'ja', fs: createLocalFileSystem(data.files),
};

initialize(context => createTypeScriptWorkerLanguageService({
  typescript: ts, compilerOptions, workerContext: context, env,
  uriConverter: { asUri: path => URI.file(path), asFileName: uri => uri.path },
  languagePlugins: [createVueLanguagePlugin(ts, compilerOptions, vueOptions, uri => uri.path)],
  languageServicePlugins: [createSemanticPlugin(ts, { disableAutoImportCache: true }), ...createVueLanguageServicePlugins(ts).filter(plugin => ![
    'vue-template (jade)', 'vue-extract-file', 'vue-document-drop', 'vue-document-highlights', 'typescript-semantic-tokens',
  ].includes(plugin.name ?? ''))],
}));
self.postMessage('sandbox-language-ready');
