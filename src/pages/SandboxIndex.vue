<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { sandboxTemplates } from '../sandbox/templates';
import { createProject, deleteProject, downloadFile, initializeLibrary, parseProject, refreshLibrary, sandboxProjects, saveProject, storageNotice } from '../sandbox/storage';
import type { SandboxProject } from '../sandbox/storage';
import { isRecord } from '../sandbox/protocol';
import { createStlSource, maxStlBytes, providedStlName } from '../sandbox/stl';

const router = useRouter();
const query = ref('');
const notice = ref('');
const deleted = ref<SandboxProject | null>(null);
const importInput = useTemplateRef<HTMLInputElement>('importInput');
const stlInput = useTemplateRef<HTMLInputElement>('stlInput');
const importingStl = ref(false);
const stlError = ref('');
const projects = computed(() => sandboxProjects.value.filter(project => project.title.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())));
onMounted(() => { initializeLibrary(); refreshLibrary(); });

function create(title: string, source: string) {
  const project = createProject(title, source);
  void router.push(`/sandbox/${project.id}`);
}
async function importStl(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || importingStl.value) return;
  stlError.value = ''; importingStl.value = true;
  try {
    if (!/\.stl$/i.test(file.name)) throw new Error('.stl ファイルを選んでください。');
    if (file.size > maxStlBytes) throw new Error('1 MB 以下の STL ファイルを選んでください。');
    const model = createStlSource(await file.arrayBuffer(), file.name);
    create(`STL · ${file.name.replace(/\.stl$/i, '')}`, model.source);
  } catch (error) { stlError.value = error instanceof Error ? error.message : String(error); }
  finally { importingStl.value = false; }
}
function remove(project: SandboxProject) {
  const result = deleteProject(project);
  if (result.kind === 'error') { notice.value = result.message; return; }
  deleted.value = project;
  notice.value = `「${project.title}」を削除しました。`;
}
function undo() {
  if (!deleted.value) return;
  const result = saveProject(deleted.value, null);
  if (result.kind === 'saved') { deleted.value = null; notice.value = '作品を元に戻しました。'; }
  else notice.value = result.kind === 'error' ? result.message : '同じ作品がすでに存在するため、復元を中止しました。';
}
function backup() {
  downloadFile('threejs-sandbox-backup.json', JSON.stringify({ schema: 1, projects: sandboxProjects.value }, null, 2), 'application/json');
}
async function importBackup(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('10 MB 以下の JSON ファイルを選んでください。');
    const value: unknown = JSON.parse(await file.text());
    if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.projects)) throw new Error('サンドボックスのバックアップ JSON を選んでください。');
    const incoming = value.projects.map((item: unknown) => parseProject(item));
    if (!incoming.every(item => item !== undefined)) throw new Error('読み取れない作品が含まれています。バックアップの形式を確認してください。');
    for (const item of incoming) createProject(item.title, item.source);
    notice.value = `${incoming.length}件の作品を読み込みました。新しい作品として追加しています。`;
  } catch (error) { notice.value = error instanceof Error ? error.message : String(error); }
}
function formatDate(value: number) {
  return new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
}
</script>

<template>
  <header class="page-heading sandbox-heading"><p class="lesson-number">SANDBOX</p><h1>自分のアイデアを、形にする。</h1><p>作品ごとにページを作り、Vue + TypeScript を編集して試せます。コードと名前はこのブラウザに自動保存します。</p></header>
  <p v-if="storageNotice" class="sandbox-notice sandbox-notice-error" role="alert">{{ storageNotice }}</p>
  <p class="sandbox-notice"><RouterLink to="/rooms">小部屋0〜4の専用プレイグラウンドで遊ぶ →</RouterLink></p>
  <section class="sandbox-stl-entry" aria-labelledby="stl-create-heading"><div class="stl-entry-icon" aria-hidden="true">STL</div><div><p class="eyebrow">YOUR 3D MODEL</p><h2 id="stl-create-heading">STLのモデルで試す</h2><p>{{ providedStlName }} を用意しました。ドラッグで回転、色や表示方法を変えながら編集できます。</p><small>モデル本体もコードに含めて保存します。別のSTLも読み込めます（1 MBまで）。</small></div><div class="stl-entry-actions"><RouterLink to="/sandbox/stl" class="sandbox-button sandbox-button-primary">このSTLから作品を作る →</RouterLink><button type="button" class="sandbox-button" :disabled="importingStl" @click="stlInput?.click()">{{ importingStl ? '読み込み中…' : '別のSTLを読み込む' }}</button><input ref="stlInput" class="visually-hidden" type="file" accept=".stl" aria-label="STLファイル" @change="importStl" /></div></section>
  <p v-if="stlError" class="sandbox-notice sandbox-notice-error" role="alert">{{ stlError }}</p>
  <section aria-labelledby="sandbox-create-heading">
    <div class="sandbox-section-heading"><h2 id="sandbox-create-heading">新しい作品を作る</h2><span>出発点を選ぶ → コードを書く → すぐ試す</span></div>
    <div class="sandbox-template-grid"><button v-for="template in sandboxTemplates" :key="template.id" type="button" class="sandbox-template" :aria-label="`${template.title}から作る`" @click="create(template.title, template.source)"><div class="template-art" :class="`template-${template.id}`" aria-hidden="true"><i /><i /><i /></div><strong>{{ template.title }}</strong><p>{{ template.description }}</p><span>このテンプレートで始める ＋</span></button></div>
  </section>
  <section class="sandbox-library" aria-labelledby="sandbox-library-heading">
    <div class="sandbox-section-heading"><h2 id="sandbox-library-heading">保存した作品 <span>{{ sandboxProjects.length }}</span></h2><div class="sandbox-library-actions"><button type="button" class="sandbox-button" @click="importInput?.click()">JSON を読み込む</button><button type="button" class="sandbox-button" :disabled="!sandboxProjects.length" @click="backup">まとめてバックアップ</button><input ref="importInput" type="file" accept=".json,application/json" class="visually-hidden" aria-label="バックアップ JSON" @change="importBackup" /></div></div>
    <div v-if="notice" class="sandbox-notice" role="status">{{ notice }}<button v-if="deleted" type="button" class="text-button" @click="undo">元に戻す</button></div>
    <label v-if="sandboxProjects.length" class="sandbox-project-search">作品名で探す<input v-model="query" type="search" placeholder="作品の名前" /></label>
    <div v-if="!sandboxProjects.length" class="sandbox-empty"><span aria-hidden="true">＋</span><h3>最初の作品を作ってみましょう</h3><p>上のテンプレートを選ぶと、編集ページが開きます。</p></div>
    <p v-else-if="!projects.length" class="empty-results">その名前の作品は見つかりませんでした。</p>
    <div v-else class="sandbox-project-grid"><article v-for="project in projects" :key="project.id" class="sandbox-project-card"><RouterLink :to="`/sandbox/${project.id}`"><span class="eyebrow">VUE + THREE.JS</span><h3>{{ project.title }}</h3><p>{{ formatDate(project.updatedAt) }} 更新</p><span>編集して続ける →</span></RouterLink><footer><RouterLink :to="`/sandbox/${project.id}?paused=1`">編集だけ開く</RouterLink><button type="button" :aria-label="`${project.title}を複製`" @click="create(`${project.title} のコピー`, project.source)">複製</button><button type="button" class="sandbox-delete" :aria-label="`${project.title}を削除`" @click="remove(project)">削除</button></footer></article></div>
  </section>
  <p class="sandbox-storage-hint">保存先は、このブラウザの localStorage です。別のブラウザへ移すときは、バックアップ JSON を読み込めます。</p>
</template>
