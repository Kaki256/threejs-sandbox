import { monaco } from './monaco';
import { sectionGuide } from '../section-guide';
import type { CodeSection } from '../section-guide';

export function createSectionGutter(options: {
  editor: monaco.editor.IStandaloneCodeEditor;
  inspect: (section: CodeSection | null) => void;
}) {
  const { editor } = options;
  const decorations = editor.createDecorationsCollection();
  let sections: CodeSection[] = [];
  let visible = true;
  function render() {
    decorations.set(visible ? sections.filter(section => section.endLine >= section.startLine).map(section => ({
      range: { startLineNumber: section.startLine, startColumn: 1, endLineNumber: section.endLine, endColumn: 1 },
      options: { linesDecorationsClassName: `sandbox-section-stripe section-${section.kind}`, linesDecorationsTooltip: sectionGuide[section.kind].title },
    })) : []);
  }
  function sectionAt(event: monaco.editor.IEditorMouseEvent) {
    if (!visible || event.target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) return null;
    const line = event.target.position?.lineNumber;
    return line ? sections.find(section => section.startLine <= line && line <= section.endLine) ?? null : null;
  }
  const subscriptions = [
    editor.onMouseMove(event => options.inspect(sectionAt(event))),
    editor.onMouseLeave(() => options.inspect(null)),
    editor.onMouseDown(event => {
      const section = sectionAt(event);
      if (section) { editor.setPosition({ lineNumber: event.target.position?.lineNumber ?? section.startLine, column: 1 }); editor.focus(); }
    }),
  ];
  return {
    setSections(value: CodeSection[]) { sections = value; render(); },
    setVisible(value: boolean) { visible = value; render(); if (!visible) options.inspect(null); },
    reveal(section: CodeSection) {
      editor.focus(); editor.setPosition({ lineNumber: section.startLine, column: 1 });
      editor.trigger('section-guide', 'editor.unfold', {});
      editor.setScrollTop(Math.max(0, editor.getTopForLineNumber(section.startLine) - 16));
    },
    dispose() { subscriptions.forEach(subscription => subscription.dispose()); decorations.clear(); },
  };
}
