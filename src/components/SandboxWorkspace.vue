<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { createProject, discardDraft, downloadFile, findProject, hasRetainedDraft, libraryVersion, retainDraft, saveProject, storageNotice } from '../sandbox/storage';
import type { SandboxProject } from '../sandbox/storage';
import type { SandboxIssue } from '../sandbox/protocol';
import SandboxCodeEditor from './SandboxCodeEditor.vue';
import SandboxPreview from './SandboxPreview.vue';
import SandboxApiSupport from './SandboxApiSupport.vue';
import type { FeatureRecipe } from '../sandbox/feature-recipes';

const props = defineProps<{ project: SandboxProject }>();
const articleLinks = !import.meta.env.VITE_PUBLIC_SANDBOX;
const route = useRoute();
const router = useRouter();
const baseline = shallowRef(props.project);
const title = ref(props.project.title);
const source = ref(props.project.source);
const autoRun = ref(route.query.paused !== '1');
const stopped = ref(route.query.paused === '1');
const runVersion = ref(0);
const issue = shallowRef<SandboxIssue | null>(null);
const currentSymbol = ref(props.project.source.includes('three/addons/loaders/STLLoader.js') ? 'STLLoader' : 'BoxGeometry');
const editor = useTemplateRef<InstanceType<typeof SandboxCodeEditor>>('editor');
const featureBusy = ref(false);
const featureNotice = ref('');
const featureFailed = ref(false);
async function addFeature(recipe: FeatureRecipe) {
  featureBusy.value = true; featureNotice.value = ''; featureFailed.value = false;
  try {
    const { applyFeature } = await import('../sandbox/features');
    const result = applyFeature(source.value, recipe);
    if (result.kind === 'error') { featureFailed.value = true; featureNotice.value = result.message; return; }
    if (!editor.value?.applyFeature(result.source, result.ranges)) { featureFailed.value = true; featureNotice.value = 'エディターの準備後にもう一度押してください。'; return; }
    featureNotice.value = result.kind === 'existing' ? '視点移動は導入済みです。対応するコードをハイライトしました。'
      : `「${recipe.title}」のコードを追加しました。${autoRun.value && !stopped.value ? 'プレビューに反映します。' : '「再実行」で確認できます。'}`;
    if (recipe.id === 'box') currentSymbol.value = 'BoxGeometry';
    else if (recipe.kind === 'orbit') currentSymbol.value = 'OrbitControls';
  } catch (error) { featureFailed.value = true; featureNotice.value = error instanceof Error ? error.message : String(error); }
  finally { featureBusy.value = false; }
}
const normalizedTitle = computed(() => title.value.trim() || '無題の作品');
const dirty = computed(() => normalizedTitle.value !== baseline.value.title || source.value !== baseline.value.source || !baseline.value.revision);
type SaveState = { kind: 'saved'; time: number } | { kind: 'dirty' } | { kind: 'error'; message: string } | { kind: 'conflict'; remote: SandboxProject | null };
const saveState = shallowRef<SaveState>(props.project.revision && !hasRetainedDraft(props.project.id) ? { kind: 'saved', time: props.project.updatedAt } : { kind: 'error', message: storageNotice.value || 'この編集はブラウザに保存できていません。コードをダウンロードして保管してください。' });
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let discarding = false;
function snapshot(): SandboxProject { return { ...baseline.value, title: normalizedTitle.value, source: source.value }; }
function persist() {
  clearTimeout(saveTimer);
  if (discarding) return;
  if (saveState.value.kind === 'conflict') { retainDraft(snapshot()); return; }
  if (!dirty.value && saveState.value.kind !== 'error') return;
  const result = saveProject(snapshot(), baseline.value.revision || null);
  if (result.kind === 'saved') {
    baseline.value = result.project;
    saveState.value = { kind: 'saved', time: result.project.updatedAt };
  } else if (result.kind === 'error') saveState.value = result;
  else { saveState.value = { kind: 'conflict', remote: result.project }; retainDraft(snapshot()); }
}
watch([title, source], () => {
  clearTimeout(saveTimer);
  if (saveState.value.kind === 'conflict') { retainDraft(snapshot()); return; }
  if (dirty.value) { saveState.value = { kind: 'dirty' }; saveTimer = setTimeout(persist, 350); }
  else saveState.value = { kind: 'saved', time: baseline.value.updatedAt };
});
watch(libraryVersion, () => {
  if (discarding) return;
  const latest = findProject(baseline.value.id);
  if (latest?.revision === baseline.value.revision) return;
  if (dirty.value || !latest) {
    clearTimeout(saveTimer);
    saveState.value = { kind: 'conflict', remote: latest ?? null };
    retainDraft(snapshot());
  } else {
    baseline.value = latest; title.value = latest.title; source.value = latest.source;
    saveState.value = { kind: 'saved', time: latest.updatedAt };
  }
});
watch([title, () => route.fullPath], () => { document.title = `${normalizedTitle.value} | サンドボックス`; }, { immediate: true, flush: 'post' });
function duplicate() {
  persist();
  const copy = createProject(`${normalizedTitle.value} のコピー`, source.value);
  if (saveState.value.kind === 'conflict') {
    discarding = true;
    discardDraft(baseline.value.id);
  }
  void router.push(`/sandbox/${copy.id}`);
}
function useRemote() {
  discarding = true;
  discardDraft(baseline.value.id);
  const project = findProject(baseline.value.id);
  if (!project) { void router.push('/sandbox'); return; }
  baseline.value = project; title.value = project.title; source.value = project.source;
  saveState.value = { kind: 'saved', time: project.updatedAt };
  discarding = false;
}
function execute() { persist(); stopped.value = false; runVersion.value++; }
function exportSource() {
  persist();
  const filename = normalizedTitle.value.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  downloadFile(`${filename}.vue`, source.value);
}
function shortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || !(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 's') { event.preventDefault(); persist(); }
  else if (event.key === 'Enter') { event.preventDefault(); execute(); }
}
function savedTime(time: number) { return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time); }
onBeforeRouteLeave(() => { persist(); });
onBeforeRouteUpdate(() => { persist(); });
onMounted(() => { window.addEventListener('pagehide', persist); window.addEventListener('keydown', shortcut); if (saveState.value.kind === 'error') persist(); });
onUnmounted(() => { persist(); clearTimeout(saveTimer); window.removeEventListener('pagehide', persist); window.removeEventListener('keydown', shortcut); });
</script>

<template>
  <header class="sandbox-workspace-heading">
    <RouterLink to="/sandbox" class="sandbox-back">← 作品一覧</RouterLink>
    <div class="sandbox-title-row"><div><h1 class="visually-hidden">{{ normalizedTitle }}</h1><label for="sandbox-title">作品の名前</label><input id="sandbox-title" v-model="title" maxlength="100" @blur="title = normalizedTitle" /></div><p class="sandbox-save-status" :class="`save-${saveState.kind}`" role="status">{{ saveState.kind === 'saved' ? `保存済み · ${savedTime(saveState.time)}` : saveState.kind === 'dirty' ? '保存待ち…' : saveState.kind === 'conflict' ? '別のタブの更新を確認' : '保存できていません' }}<span>このブラウザに自動保存</span></p></div>
    <div class="sandbox-toolbar"><div><button type="button" class="sandbox-button sandbox-button-primary" @click="execute">▶ 再実行</button><button type="button" class="sandbox-button" :disabled="stopped" @click="stopped = true">■ 停止</button><label class="sandbox-auto-run"><input v-model="autoRun" type="checkbox" @change="autoRun && (stopped = false)" />変更を自動で反映</label></div><div><button type="button" class="sandbox-button" @click="persist">保存</button><button type="button" class="sandbox-button" @click="duplicate">複製</button><button type="button" class="sandbox-button" @click="exportSource">.vue をダウンロード</button></div></div>
  </header>
  <div v-if="saveState.kind === 'error'" class="sandbox-notice sandbox-notice-error" role="alert">{{ saveState.message }}<button type="button" class="text-button" @click="persist">再保存する</button></div>
  <div v-if="saveState.kind === 'conflict'" class="sandbox-notice sandbox-notice-error" role="alert"><p>別のタブでこの作品が{{ saveState.remote ? '更新されました' : '削除されました' }}。編集中のコードを残しています。</p><div><button type="button" class="sandbox-button" @click="duplicate">自分の編集を別作品に保存</button><button type="button" class="sandbox-button" @click="useRemote">{{ saveState.remote ? 'ブラウザ側の更新を読み込む' : '一覧に戻る' }}</button></div></div>
  <div class="sandbox-workspace-grid"><SandboxCodeEditor ref="editor" v-model="source" :feature-busy="featureBusy" :feature-notice="featureNotice" :feature-failed="featureFailed" @feature="addFeature" @history="featureNotice = ''; featureFailed = false" @save="persist" @run="execute" @symbol="currentSymbol = $event" /><div class="sandbox-preview-column"><SandboxPreview :title="normalizedTitle" :source="source" :auto-run="autoRun" :run-version="runVersion" :stopped="stopped" @issue="issue = $event" /><section v-if="issue" class="sandbox-code-error" aria-live="polite"><h3>{{ issue.phase === 'compile' ? 'コードを確認してください' : '実行中にエラーがありました' }}</h3><pre>{{ issue.message }}</pre><button v-if="issue.line" type="button" class="text-button" @click="editor?.focusLine(issue.line)">{{ issue.line }} 行目へ移動</button></section><SandboxApiSupport :symbol="currentSymbol" /><details class="sandbox-editor-help"><summary>使い方・import</summary><p>Vue の <code>&lt;script setup lang="ts"&gt;</code>・<code>&lt;template&gt;</code>・<code>&lt;style scoped&gt;</code> をこのページで編集できます。変更したコードは自動保存され、自動反映を切れば好きなタイミングで実行できます。</p><p>使える import：<code>vue</code>、<code>three</code>、<code>three/webgpu</code>、OrbitControls、GLTFLoader、TDSLoader、ColladaLoader、OBJLoader、STLLoader、RectAreaLightTexturesLib。</p><p>エディターでは Vue と TypeScript の型・構文を確認できます。プロジェクト全体の型チェックは、書き出した Vue ファイルをプロジェクトに置いて <code>bun run typecheck</code> で確認できます。</p><p>画像やモデルはデータ URL、または CORS に対応した URL を使えます。複数ファイルや追加パッケージを使う場合は .vue を書き出して Vite 側で続けられます。</p><RouterLink v-if="articleLinks" to="/reference">用語・コードのリファレンスを開く →</RouterLink></details></div></div>
</template>
