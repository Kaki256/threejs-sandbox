<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { initializeEditor, monaco } from '../sandbox/editor/monaco';
import type { FeatureRange } from '../sandbox/features';
import type { FeatureRecipe } from '../sandbox/feature-recipes';
import { sectionGuide } from '../sandbox/section-guide';
import type { CodeSection, SectionKind } from '../sandbox/section-guide';
import { createSectionGutter } from '../sandbox/editor/section-gutter';
import SandboxFeatures from './SandboxFeatures.vue';
import SandboxFeaturePalette from './SandboxFeaturePalette.vue';

defineProps<{ featureBusy: boolean; featureNotice: string; featureFailed: boolean }>();
const source = defineModel<string>({ required: true });
const emit = defineEmits<{ save: []; run: []; symbol: [symbol: string]; feature: [recipe: FeatureRecipe]; history: [] }>();
const host = useTemplateRef<HTMLElement>('host');
const manager = useTemplateRef<InstanceType<typeof SandboxFeatures>>('manager');
const guide = ref(true);
const guideNotice = ref('');
const sections = shallowRef<CodeSection[]>([]);
const recipes = shallowRef<FeatureRecipe[]>([]);
const hovered = shallowRef<CodeSection | null>(null);
const focusedKind = ref<SectionKind | null>(null);
const navigation = computed(() => sections.value.filter((section, index, all) => all.findIndex(item => item.kind === section.kind) === index)
  .map(section => sections.value.find(item => item.target === section.kind) ?? section));
const activeSection = computed(() => sections.value.find(section => section.startLine <= cursor.value.lineNumber && cursor.value.lineNumber <= section.endLine));
const inspected = computed(() => hovered.value ?? navigation.value.find(section => section.kind === focusedKind.value) ?? activeSection.value);
const contextualTarget = computed(() => {
  const kind = inspected.value?.kind;
  return kind === 'items' || kind === 'camera' ? navigation.value.find(section => section.target === kind)?.target ?? null : null;
});
const canUndo = ref(false);
const canRedo = ref(false);
const status = ref('入力サポートを準備中…');
const failed = ref(false);
const markers = shallowRef<monaco.editor.IMarker[]>([]);
const cursor = ref({ lineNumber: 1, column: 1 });
const dark = ref(false);
const wrap = ref(false);
const formatting = ref(false);
const notice = ref('');
const featureChanges = shallowRef<{ label: string; line: number; start: number; end: number }[]>([]);
const lineCount = computed(() => source.value.split('\n').length);
const errorSeverity = monaco.MarkerSeverity.Error;
const hasErrors = computed(() => markers.value.some(marker => marker.severity === errorSeverity));
let instance: monaco.editor.IStandaloneCodeEditor | undefined;
let model: monaco.editor.ITextModel | undefined;
let disposed = false;
let changing = false;
let featureDecorations: monaco.editor.IEditorDecorationsCollection | undefined;
let sectionGutter: ReturnType<typeof createSectionGutter> | undefined;
// Alternative version ids return to their earlier values on undo/redo; this model is kept for the page lifetime.
let initialVersion = 0;
let latestVersion = 0;
let analyze: ((source: string) => CodeSection[]) | undefined;
let sectionTimer: ReturnType<typeof setTimeout> | undefined;
const subscriptions: monaco.IDisposable[] = [];
function refreshSections() {
  clearTimeout(sectionTimer);
  if (!analyze || !model || disposed) return;
  try { sections.value = analyze(model.getValue()); guideNotice.value = ''; }
  catch { sections.value = []; guideNotice.value = 'コードの構文が整うと、場所ガイドを再表示します。'; }
  sectionGutter?.setSections(sections.value);
}
function showSection(section: CodeSection) {
  hovered.value = null; focusedKind.value = null;
  sectionGutter?.reveal(section);
  if (section.endLine < section.startLine) hovered.value = section;
}
function updateHistory() {
  if (!model || disposed) return;
  const version = model.getAlternativeVersionId();
  canUndo.value = version !== initialVersion;
  canRedo.value = version !== latestVersion;
}
function history(direction: 'undo' | 'redo') {
  if (!instance || (direction === 'undo' ? !canUndo.value : !canRedo.value)) return;
  instance.focus(); instance.trigger('history-button', direction, null);
}
function historyShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor')) return;
  const key = event.key.toLowerCase();
  if (key === 'z' || key === 'y' && !event.metaKey) {
    event.preventDefault(); history(key === 'y' || event.shiftKey ? 'redo' : 'undo');
  }
}

onMounted(async () => {
  const ready = initializeEditor();
  if (!host.value) return;
  model = monaco.editor.createModel(source.value, 'vue', monaco.Uri.parse(`file:///Sandbox-${crypto.randomUUID()}.vue`));
  initialVersion = latestVersion = model.getAlternativeVersionId();
  instance = monaco.editor.create(host.value, {
    model, theme: 'sandbox-light', ariaLabel: 'Vue と TypeScript のコード',
    automaticLayout: true, fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 13, lineHeight: 23,
    minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 },
    stickyScroll: { enabled: false },
    tabSize: 2, insertSpaces: true, wordWrap: 'off', lineNumbersMinChars: 3, folding: true,
    bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true },
    quickSuggestions: { other: true, comments: false, strings: false }, suggest: { showWords: false, preview: true },
    parameterHints: { enabled: true, cycle: true }, hover: { delay: 350 }, fixedOverflowWidgets: true,
    lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.On }, inlayHints: { enabled: 'on' },
  });
  featureDecorations = instance.createDecorationsCollection();
  sectionGutter = createSectionGutter({ editor: instance, inspect: section => { hovered.value = section; } });
  void import('../sandbox/sections').then(module => {
    if (disposed) return;
    analyze = module.analyzeSections; refreshSections();
  }).catch(() => { if (!disposed) guideNotice.value = '場所ガイドを読み込めませんでした。ページを再読み込みして試してください。'; });
  subscriptions.push(model.onDidChangeContent(event => {
    featureDecorations?.clear(); featureChanges.value = [];
    if (!event.isUndoing && !event.isRedoing && model) { latestVersion = model.getAlternativeVersionId(); notice.value = ''; }
    else { notice.value = event.isUndoing ? '一手戻しました。' : 'やり直しました。'; emit('history'); }
    queueMicrotask(updateHistory);
    clearTimeout(sectionTimer); sectionTimer = setTimeout(refreshSections, 180);
    if (!changing && model) source.value = model.getValue();
  }), instance.onDidChangeCursorPosition(event => {
    hovered.value = null; focusedKind.value = null;
    cursor.value = event.position;
    const word = model?.getWordAtPosition(event.position);
    if (word) emit('symbol', word.word);
  }), instance.onDidFocusEditorText(() => { hovered.value = null; focusedKind.value = null; }), monaco.editor.onDidChangeMarkers(resources => {
    if (model && resources.some(resource => resource.toString() === model?.uri.toString())) markers.value = monaco.editor.getModelMarkers({ resource: model.uri });
  }));
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'));
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => emit('run'));
  instance.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => { void format(); });
  window.addEventListener('keydown', historyShortcut);
  try { await ready; if (!disposed) status.value = 'ローカル型情報 · Vue / Three.js'; }
  catch (error) { if (!disposed) { failed.value = true; status.value = error instanceof Error ? error.message : String(error); } }
});

watch(source, value => {
  if (!model || model.getValue() === value) return;
  changing = true;
  instance?.executeEdits('external-update', [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }]);
  changing = false;
});
watch(dark, value => monaco.editor.setTheme(value ? 'sandbox-dark' : 'sandbox-light'));
watch(wrap, value => instance?.updateOptions({ wordWrap: value ? 'on' : 'off' }));
watch(guide, value => { hovered.value = null; focusedKind.value = null; sectionGutter?.setVisible(value); });

function action(id: string) { instance?.focus(); instance?.trigger('toolbar', id, {}); }
async function format() {
  if (!instance || !model || formatting.value) return;
  formatting.value = true; notice.value = '';
  const version = model.getVersionId();
  const currentModel = model;
  try {
    const [{ format }, html, typescript, estree, postcss] = await Promise.all([
      import('prettier/standalone'), import('prettier/plugins/html'), import('prettier/plugins/typescript'), import('prettier/plugins/estree'), import('prettier/plugins/postcss'),
    ]);
    const formatted = await format(currentModel.getValue(), { parser: 'vue', plugins: [html, typescript, estree.default, postcss], singleQuote: true, tabWidth: 2, printWidth: 90 });
    if (disposed || currentModel.isDisposed()) return;
    if (version !== currentModel.getVersionId()) { notice.value = '入力が続いていたため整形を見送りました。もう一度実行できます。'; return; }
    instance.pushUndoStop();
    instance.executeEdits('format', [{ range: currentModel.getFullModelRange(), text: formatted, forceMoveMarkers: true }]);
    instance.pushUndoStop(); notice.value = '整形しました。Ctrl / ⌘ + Z で戻せます。';
  } catch (error) { notice.value = error instanceof Error ? error.message : String(error); }
  finally { formatting.value = false; }
}
function focusLine(line: number, column = 1) {
  if (!instance) return;
  instance.focus(); instance.setPosition({ lineNumber: line, column }); instance.revealLineInCenterIfOutsideViewport(line);
}
function showFeatureRange(start: number, end: number) {
  if (!instance || !model) return;
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(Math.max(start, end - 1));
  instance.focus();
  instance.setPosition(from);
  instance.revealRangeInCenter(new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column));
  host.value?.scrollIntoView({ block: 'nearest' });
}
function applyFeature(value: string, ranges: FeatureRange[]) {
  if (!instance || !model) return false;
  if (model.getValue() !== value) {
    instance.pushUndoStop();
    instance.executeEdits('add-feature', [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }]);
    instance.pushUndoStop();
  }
  refreshSections();
  const currentModel = model;
  featureChanges.value = ranges.map(range => ({ ...range, line: currentModel.getPositionAt(range.start).lineNumber }));
  featureDecorations?.set(ranges.map(range => {
    const from = currentModel.getPositionAt(range.start), to = currentModel.getPositionAt(Math.max(range.start, range.end - 1));
    return { range: new monaco.Range(from.lineNumber, 1, to.lineNumber, to.column), options: {
      isWholeLine: true, className: 'sandbox-feature-highlight', linesDecorationsClassName: 'sandbox-feature-gutter',
      overviewRuler: { color: '#2caf9b', position: monaco.editor.OverviewRulerLane.Full },
    } };
  }));
  const first = ranges[0];
  if (first) showFeatureRange(first.start, first.end);
  return true;
}
defineExpose({ focusLine, applyFeature });
onUnmounted(() => { disposed = true; clearTimeout(sectionTimer); window.removeEventListener('keydown', historyShortcut); subscriptions.forEach(subscription => subscription.dispose()); sectionGutter?.dispose(); instance?.dispose(); model?.dispose(); });
</script>

<template>
  <section class="sandbox-editor" :class="{ 'editor-dark': dark }" aria-labelledby="sandbox-editor-heading">
    <header><h2 id="sandbox-editor-heading"><span class="editor-file-icon" aria-hidden="true">V</span> Sandbox.vue</h2><span>Vue 3 · TypeScript</span></header>
    <div class="sandbox-editor-tools" role="toolbar" aria-label="コードの補助機能">
      <div class="sandbox-history-tools"><button type="button" :disabled="!canUndo" title="Ctrl / ⌘ + Z" @click="history('undo')">↶ 一手戻る</button><button type="button" :disabled="!canRedo" title="Ctrl + Y / Ctrl + Shift + Z / ⌘ + Shift + Z" @click="history('redo')">↷ やり直す</button></div>
      <div><button type="button" title="Ctrl / ⌘ + Space" @click="action('editor.action.triggerSuggest')">補完</button><button type="button" title="Ctrl / ⌘ + Shift + Space" @click="action('editor.action.triggerParameterHints')">引数ヒント</button><button type="button" :disabled="formatting" title="Shift + Alt + F" @click="format">{{ formatting ? '整形中…' : '整形' }}</button><button type="button" title="Ctrl / ⌘ + F" @click="action('actions.find')">検索</button><button type="button" title="Windows：Ctrl + H / Mac：⌘ + Alt + F" @click="action('editor.action.startFindReplaceAction')">置換</button></div>
      <div><label><input v-model="guide" type="checkbox" />場所ガイド</label><label><input v-model="wrap" type="checkbox" />折り返し</label><label><input v-model="dark" type="checkbox" />ダーク</label></div>
    </div>
    <p v-if="featureNotice" class="sandbox-feature-notice sandbox-editor-feature-notice" :class="{ 'feature-failed': featureFailed }" :role="featureFailed ? 'alert' : 'status'">{{ featureNotice }}</p>
    <div class="sandbox-code-surface" :class="{ 'guide-off': !guide }">
      <nav v-if="guide" class="sandbox-section-rail" aria-label="コードの場所">
        <span class="sandbox-rail-caption">場所</span>
        <button v-for="section in navigation" :key="section.kind" type="button" :class="`section-${section.kind}`" :aria-label="`${sectionGuide[section.kind].short}のコードへ`" :aria-pressed="activeSection?.kind === section.kind" aria-describedby="sandbox-section-description" @mouseenter="hovered = section" @focus="hovered = null; focusedKind = section.kind" @blur="focusedKind = null" @click="showSection(section)">{{ sectionGuide[section.kind].short }}</button>
      </nav>
      <aside v-if="guide" class="sandbox-section-info" :class="inspected && `section-${inspected.kind}`" aria-label="選択した場所の説明">
        <template v-if="inspected">
          <div class="sandbox-section-info-title"><strong>{{ sectionGuide[inspected.kind].title }}</strong><span>L{{ inspected.startLine }}{{ inspected.endLine >= inspected.startLine ? `–${inspected.endLine}` : '' }}</span></div>
          <p id="sandbox-section-description">{{ sectionGuide[inspected.kind].description }}</p>
        </template>
        <p v-else id="sandbox-section-description">左の色付きマークにマウスを重ねるか、Tabでフォーカスすると説明を表示します。クリックでコードへ移動できます。</p>
        <SandboxFeaturePalette :target="contextualTarget" :recipes="recipes" :busy="featureBusy" @feature="emit('feature', $event)" @create="manager?.openCreate($event)" />
        <p v-if="guideNotice" role="status">{{ guideNotice }}</p>
      </aside>
      <div ref="host" class="sandbox-monaco-host" />
    </div>
    <footer><span>{{ lineCount }} 行 · Ln {{ cursor.lineNumber }}, Col {{ cursor.column }}</span><span :class="{ 'editor-support-failed': failed }" role="status">{{ status }}</span></footer>
    <div v-if="featureChanges.length" class="sandbox-feature-changes" role="status"><span>変更箇所</span><button v-for="change in featureChanges" :key="change.start" type="button" @click="showFeatureRange(change.start, change.end)">{{ change.label }} · {{ change.line }} 行目 ↗</button><small>コードを編集するとハイライトが消えます。</small></div>
    <p v-if="notice" class="sandbox-format-notice" role="status">{{ notice }}</p>
    <SandboxFeatures ref="manager" @recipes="recipes = $event" />
    <details class="sandbox-problems" :open="hasErrors">
      <summary>問題 <span>{{ markers.length }}</span><small>{{ markers.length ? 'クリックで該当箇所へ' : '現在、型・構文の問題はありません' }}</small></summary>
      <ul v-if="markers.length"><li v-for="(marker, index) in markers" :key="index"><button type="button" @click="focusLine(marker.startLineNumber, marker.startColumn)"><span class="problem-icon" :class="{ warning: marker.severity !== errorSeverity }">{{ marker.severity === errorSeverity ? '×' : '△' }}</span><span>{{ marker.message }}<small>{{ marker.startLineNumber }}:{{ marker.startColumn }} · {{ marker.source || 'TypeScript' }}</small></span></button></li></ul>
    </details>
    <details class="sandbox-editor-shortcuts"><summary>エディターの使い方・ショートカット</summary><p>左の色マークにマウスを重ねるかフォーカスすると場所の説明、クリックでそのコードへ移動します。入力中はカーソル位置に対応する説明を表示します。</p><p>単語にマウスを重ねると型と説明、関数の ( の後や , の後には引数ヒントが表示されます。「補完」「引数ヒント」ボタンからも開けます。</p><p>Ctrl / ⌘ + Z：一手戻る · Ctrl + Y / Ctrl + Shift + Z / ⌘ + Shift + Z：やり直す。箱の追加や整形は1回でまとめて戻せます。戻したコードも自動保存・自動反映します。</p><p>Ctrl / ⌘ + Space：補完 · Ctrl / ⌘ + Shift + Space：引数 · Ctrl / ⌘ + F：検索 · Windows は Ctrl + H、Mac は ⌘ + Alt + F：置換 · F2：変数名を変更 · Shift + Alt + F：整形</p><p>Ctrl / ⌘ + S：保存 · Ctrl / ⌘ + Enter：実行 · Tab：字下げ（Windows は Ctrl + M、Mac は Ctrl + Shift + M で Tab によるフォーカス移動へ切り替え）。型情報と日本語の説明はアプリ内にあります。</p></details>
  </section>
</template>
