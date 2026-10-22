import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all';
import { activateAutoInsertion, activateMarkers, registerProviders } from '@volar/monaco';
import type { WorkerLanguageService } from '@volar/monaco/worker';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import VueWorker from './vue.worker?worker';
import { conf as htmlConfiguration, language as htmlLanguage } from 'monaco-editor/esm/vs/basic-languages/html/html';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';

let initialized: Promise<void> | undefined;
let languageWorker: monaco.editor.MonacoWebWorker<WorkerLanguageService>;
const subscriptions: monaco.IDisposable[] = [];

export { monaco };

export function initializeEditor() {
  return initialized ??= initialize();
}

async function initialize() {
  self.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label !== 'vue') return new EditorWorker();
      return new Promise<Worker>((resolve, reject) => {
        const worker = new VueWorker();
        const timeout = setTimeout(() => { worker.terminate(); reject(new Error('入力サポートを読み込めませんでした。ページを再読み込みしてください。')); }, 30000);
        worker.addEventListener('error', event => { clearTimeout(timeout); reject(new Error(event.message || '入力サポートを開始できませんでした。')); }, { once: true });
        worker.addEventListener('message', function ready(event: MessageEvent<unknown>) {
          if (event.data !== 'sandbox-language-ready') return;
          clearTimeout(timeout); worker.removeEventListener('message', ready); resolve(worker);
        });
      });
    },
  };
  monaco.languages.register({ id: 'vue', extensions: ['.vue'] });
  subscriptions.push(monaco.languages.setMonarchTokensProvider('vue', {
    ...htmlLanguage,
    tokenizer: {
      ...htmlLanguage.tokenizer,
      script: [
        [/>/, { token: 'delimiter', next: '@scriptEmbedded', nextEmbedded: 'typescript' }],
        ...htmlLanguage.tokenizer.script,
      ],
      root: [
        [/\{\{/, { token: 'delimiter', next: '@interpolation', nextEmbedded: 'typescript' }],
        ...htmlLanguage.tokenizer.root.slice(0, -1),
        [/[^<{]+/, ''], [/\{/, 'delimiter'],
      ],
      interpolation: [[/\}\}/, { token: 'delimiter', next: '@pop', nextEmbedded: '@pop' }]],
    },
  }));
  subscriptions.push(monaco.languages.setLanguageConfiguration('vue', {
    ...htmlConfiguration,
    comments: { blockComment: ['<!--', '-->'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] }, { open: "'", close: "'", notIn: ['string'] }, { open: '`', close: '`', notIn: ['string'] },
    ],
  }));
  monaco.editor.defineTheme('sandbox-light', {
    base: 'vs', inherit: true,
    rules: [{ token: 'comment', foreground: '687D71', fontStyle: 'italic' }, { token: 'keyword', foreground: '9258A6' }, { token: 'string', foreground: 'A44926' }, { token: 'number', foreground: '087F75' }, { token: 'tag', foreground: '315EB6' }],
    colors: { 'editor.background': '#F9FBFF', 'editor.foreground': '#273F5D', 'editorLineNumber.foreground': '#91A3BC', 'editorLineNumber.activeForeground': '#315EB6', 'editor.lineHighlightBackground': '#ECF2FC', 'editor.selectionBackground': '#CEE0FF', 'editorWidget.border': '#CCD9ED' },
  });
  monaco.editor.defineTheme('sandbox-dark', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#111C2D', 'editor.lineHighlightBackground': '#1B2B43' } });

  languageWorker = monaco.editor.createWebWorker<WorkerLanguageService>({ moduleId: 'sandbox/vue', label: 'vue', host: {}, createData: {} });
  const synced = () => monaco.editor.getModels().filter(model => model.getLanguageId() === 'vue').map(model => model.uri);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    subscriptions.push(await Promise.race([
      registerProviders(languageWorker, ['vue'], synced, monaco.languages),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('入力サポートの準備に時間がかかっています。ページを再読み込みしてください。')), 35000); }),
    ]));
    subscriptions.push(activateMarkers(languageWorker, ['vue'], 'sandbox-vue', synced, monaco.editor), activateAutoInsertion(languageWorker, ['vue'], synced, monaco.editor));
  } catch (error) { languageWorker.dispose(); throw error; }
  finally { clearTimeout(timeout); }
}

if (import.meta.hot) import.meta.hot.dispose(() => { subscriptions.forEach(item => item.dispose()); languageWorker?.dispose(); });
