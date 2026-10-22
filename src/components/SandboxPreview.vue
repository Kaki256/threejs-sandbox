<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type { CompiledSandbox, SandboxIssue } from '../sandbox/protocol';
import { isRecord, sandboxChannel } from '../sandbox/protocol';
import { downloadFile } from '../sandbox/storage';

const props = defineProps<{ source: string; autoRun: boolean; runVersion: number; stopped: boolean; title: string }>();
const emit = defineEmits<{ issue: [issue: SandboxIssue | null] }>();
const frame = useTemplateRef<HTMLIFrameElement>('frame');
const run = shallowRef<{ id: string; output: CompiledSandbox; html: string } | null>(null);
const state = ref<'idle' | 'compiling' | 'loading' | 'running' | 'error'>('idle');
const capturing = ref(false);
const captureNotice = ref('');
let captureTimer: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let loadTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

function stopFrame() {
  clearTimeout(captureTimer); capturing.value = false; captureNotice.value = '';
  clearTimeout(loadTimer);
  if (run.value) frame.value?.contentWindow?.postMessage({ channel: sandboxChannel, runId: run.value.id, type: 'stop' }, '*');
  run.value = null;
}
function capture() {
  if (capturing.value || state.value !== 'running') return;
  captureProgress();
  frame.value?.contentWindow?.postMessage({ channel: sandboxChannel, runId: run.value?.id, type: 'capture' }, '*');
}
function captureProgress() {
  clearTimeout(captureTimer);
  capturing.value = true; captureNotice.value = '画像を作成中…';
  captureTimer = setTimeout(() => { capturing.value = false; captureNotice.value = '撮影が完了しませんでした。描画中のプレビューで再度試してください。'; }, 10000);
}
async function execute() {
  clearTimeout(timer);
  const version = ++requestVersion;
  const source = props.source;
  state.value = 'compiling';
  try {
    const { compileSandbox } = await import('../sandbox/compiler');
    if (version !== requestVersion) return;
    const compiled = compileSandbox(source);
    if (compiled.kind === 'error') { emit('issue', compiled.issue); state.value = 'error'; return; }
    emit('issue', null);
    stopFrame();
    state.value = 'loading';
    const runtimeUrl = new URL(`${import.meta.env.BASE_URL}sandbox-runtime.js`, window.location.origin).href;
    run.value = { id: crypto.randomUUID(), output: compiled.output,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;background:#0b1220;color:#e2e8f0;font:14px system-ui}#app{min-height:100vh;display:grid;place-items:center}canvas{display:block;max-width:100%;height:auto!important}*{box-sizing:border-box}</style></head><body><div id="app"></div><script src="${runtimeUrl}"><\/script></body></html>` };
    await nextTick();
    loadTimer = setTimeout(() => {
      if (version === requestVersion && state.value === 'loading') {
        state.value = 'error';
        emit('issue', { phase: 'runtime', message: 'プレビューの読み込みが完了しませんでした。「再実行」で試してください。' });
      }
    }, 15000);
  } catch (error) {
    if (version !== requestVersion) return;
    state.value = 'error';
    emit('issue', { phase: 'compile', message: error instanceof Error ? error.message : String(error) });
  }
}
function message(event: MessageEvent) {
  const data: unknown = event.data;
  if (!run.value || event.source !== frame.value?.contentWindow || !isRecord(data) || data.channel !== sandboxChannel || data.runId !== run.value.id) return;
  if (data.type === 'booted') frame.value?.contentWindow?.postMessage({ channel: sandboxChannel, runId: run.value.id, type: 'run', ...run.value.output }, '*');
  else if (data.type === 'ready' && state.value !== 'error') { clearTimeout(loadTimer); state.value = 'running'; }
  else if (data.type === 'error' && typeof data.message === 'string') {
    clearTimeout(loadTimer); state.value = 'error'; emit('issue', { phase: 'runtime', message: data.message });
  }
  else if (data.type === 'capture') {
    if (data.status === 'started') { captureProgress(); return; }
    clearTimeout(captureTimer); capturing.value = false;
    if (data.status === 'error' && typeof data.message === 'string') { captureNotice.value = data.message; return; }
    if (data.status !== 'success' || !(data.image instanceof ArrayBuffer) || data.image.byteLength < 8 || data.image.byteLength > 80 * 1024 * 1024) return;
    const bytes = new Uint8Array(data.image, 0, 8);
    if (!bytes.every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return;
    const filename = props.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'sandbox';
    downloadFile(`${filename}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.png`, new Blob([data.image], { type: 'image/png' }));
    captureNotice.value = '現在の視点を PNG で保存しました。';
  }
}
watch(() => props.source, () => {
  clearTimeout(timer);
  if (props.autoRun && !props.stopped) timer = setTimeout(() => { void execute(); }, 650);
});
watch(() => props.autoRun, value => {
  clearTimeout(timer);
  if (value && !props.stopped) void execute();
  else if (!value && state.value === 'compiling') { requestVersion++; state.value = run.value ? 'running' : 'idle'; }
});
watch(() => props.runVersion, () => { if (!props.stopped) void execute(); });
watch(() => props.stopped, value => {
  if (value) { requestVersion++; clearTimeout(timer); stopFrame(); state.value = 'idle'; }
});
onMounted(() => { window.addEventListener('message', message); if (!props.stopped) void execute(); });
onUnmounted(() => { requestVersion++; clearTimeout(timer); stopFrame(); window.removeEventListener('message', message); });
</script>

<template>
  <section class="sandbox-preview" aria-labelledby="sandbox-preview-heading">
    <header><h2 id="sandbox-preview-heading">プレビュー</h2><div class="sandbox-preview-actions"><button type="button" class="sandbox-button" :disabled="state !== 'running' || capturing" @click="capture">{{ capturing ? '撮影中…' : 'スクショを保存' }}</button><span class="sandbox-run-state" role="status">{{ { idle: '停止中', compiling: 'コンパイル中…', loading: '読み込み中…', running: '実行中', error: 'エラーを確認' }[state] }}</span></div></header>
    <div class="sandbox-preview-stage">
      <iframe v-if="run" :key="run.id" ref="frame" :name="run.id" :srcdoc="run.html" sandbox="allow-scripts allow-pointer-lock" title="サンドボックスの実行結果" />
      <div v-else class="sandbox-preview-empty"><span aria-hidden="true">◇</span><p>{{ state === 'compiling' ? 'Vue + TypeScript を準備しています。' : '実行すると、ここに結果が表示されます。' }}</p></div>
    </div>
    <p class="sandbox-preview-note">コードの変更は新しいシーンとして反映されます。</p>
    <p v-if="captureNotice" class="sandbox-capture-notice" role="status">{{ captureNotice }}</p>
  </section>
</template>
