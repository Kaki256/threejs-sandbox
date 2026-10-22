declare module 'monaco-editor/esm/vs/editor/editor.worker.js' {
  import type { worker } from 'monaco-editor';
  export function initialize(factory: (context: worker.IWorkerContext<unknown>, createData: unknown) => object): void;
}
declare module 'monaco-editor/esm/vs/basic-languages/html/html' {
  import type { languages } from 'monaco-editor';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage & { tokenizer: { script: languages.IMonarchLanguageRule[]; root: languages.IMonarchLanguageRule[] } };
}
declare module 'prettier/plugins/estree' {
  import type { Plugin } from 'prettier';
  const plugin: Plugin;
  export default plugin;
}
