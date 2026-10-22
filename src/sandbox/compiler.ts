import { compileScript, compileStyle, compileTemplate, parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js';
import ts from 'typescript';
import type { CompiledSandbox, SandboxIssue } from './protocol';

type CompileResult = { kind: 'success'; output: CompiledSandbox } | { kind: 'error'; issue: SandboxIssue };

export function compileSandbox(source: string): CompileResult {
  try {
    const parsed = parse(source, { filename: 'Sandbox.vue' });
    const error = parsed.errors[0];
    if (error) return { kind: 'error', issue: { phase: 'compile', message: typeof error === 'string' ? error : error.message, ...(typeof error !== 'string' && 'loc' in error && error.loc ? { line: error.loc.start.line } : {}) } };
    const original = parsed.descriptor;
    if (!original.template) return { kind: 'error', issue: { phase: 'compile', message: '<template> を用意してください。' } };
    if (original.template.lang && original.template.lang !== 'html') return { kind: 'error', issue: { phase: 'compile', message: '<template> は HTML で記述してください。' } };
    if (original.script?.src || original.scriptSetup?.src || original.template.src || original.styles.some(style => style.src)) {
      return { kind: 'error', issue: { phase: 'compile', message: 'このページの .vue コード内に script・template・style をまとめて書いてください。' } };
    }
    const descriptor = original.script || original.scriptSetup ? original : parse(`${source}\n<script setup lang="ts">\nconst __sandbox_placeholder = true;\n</script>`, { filename: 'Sandbox.vue' }).descriptor;
    const scopeId = 'data-v-sandbox';
    const css: string[] = [];
    for (const style of descriptor.styles) {
      if (style.lang && style.lang !== 'css') return { kind: 'error', issue: { phase: 'compile', message: '<style> は CSS で記述してください。', line: style.loc.start.line } };
      if (style.module) return { kind: 'error', issue: { phase: 'compile', message: '<style scoped> または通常の <style> を使ってください。' } };
      const compiled = compileStyle({ source: style.content, filename: 'Sandbox.vue', id: scopeId, scoped: style.scoped });
      if (compiled.errors[0]) return { kind: 'error', issue: { phase: 'compile', message: String(compiled.errors[0]), line: style.loc.start.line } };
      css.push(compiled.code);
    }
    const script = compileScript(descriptor, { id: 'sandbox', inlineTemplate: true, isProd: false, genDefaultAs: '__sandbox_component__' });
    let content = script.content;
    if (!descriptor.scriptSetup) {
      const template = compileTemplate({ source: original.template.content, filename: 'Sandbox.vue', id: 'sandbox', scoped: descriptor.styles.some(style => style.scoped), compilerOptions: { bindingMetadata: script.bindings } });
      if (template.errors[0]) return { kind: 'error', issue: { phase: 'compile', message: String(template.errors[0]) } };
      content += `\n${template.code}\n__sandbox_component__.render = render;`;
    }
    content += '\nexport default __sandbox_component__;';
    const transpiled = ts.transpileModule(content, {
      fileName: 'Sandbox.ts', reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, isolatedModules: true },
    });
    const diagnostic = transpiled.diagnostics?.find(item => item.category === ts.DiagnosticCategory.Error);
    if (diagnostic) return { kind: 'error', issue: { phase: 'compile', message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') } };
    return { kind: 'success', output: { code: transpiled.outputText, css: css.join('\n'), scopeId } };
  } catch (error) {
    return { kind: 'error', issue: { phase: 'compile', message: error instanceof Error ? error.message : String(error) } };
  }
}
