<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef } from 'vue';
import { parseCustomRecipe, recipeStoragePrefix } from '../sandbox/feature-recipes';
import type { FeatureRecipe } from '../sandbox/feature-recipes';
import type { FeatureTarget } from '../sandbox/section-guide';

const emit = defineEmits<{ recipes: [recipes: FeatureRecipe[]] }>();
const host = useTemplateRef<HTMLElement>('host');
const custom = shallowRef<FeatureRecipe[]>([]);
const form = ref(false);
const editing = ref<string | null>(null);
const target = ref<FeatureTarget>('items');
const title = ref('球を追加');
const description = ref('好きな形や動きをコードとして追加します。');
const imports = ref('');
const setup = ref(`const __id__Geometry = new THREE.SphereGeometry(0.02, 24, 16);
const __id__Material = new THREE.MeshNormalMaterial();
const __id__ = new THREE.Mesh(__id__Geometry, __id__Material);
__id__.position.set(0.06, 0.02, 0);
scene.add(__id__);`);
const frame = ref('');
const cleanup = ref('__id__Geometry.dispose();\n__id__Material.dispose();');
const storageError = ref('');

function load() {
  try {
    const recipes: FeatureRecipe[] = [];
    let invalid = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(recipeStoragePrefix)) continue;
      try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
        const recipe = parseCustomRecipe(value);
        if (recipe && key === recipeStoragePrefix + recipe.id) recipes.push(recipe);
        else invalid = true;
      } catch { invalid = true; }
    }
    custom.value = recipes.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    emit('recipes', custom.value);
    storageError.value = invalid ? '読み取れないボタンがあります。元の保存データは残しています。' : '';
  } catch { storageError.value = 'ブラウザから追加ボタンを読み込めません。'; }
}
function save() {
  const recipe = parseCustomRecipe({ id: editing.value ?? `custom-${crypto.randomUUID()}`, kind: 'snippet', target: target.value, title: title.value,
    description: description.value, imports: imports.value, setup: setup.value, frame: frame.value, cleanup: cleanup.value });
  if (!recipe) { storageError.value = '名前と初期化コードを入力してください。'; return; }
  try {
    localStorage.setItem(recipeStoragePrefix + recipe.id, JSON.stringify(recipe));
    load(); form.value = false; editing.value = null;
  } catch { storageError.value = 'ボタンを保存できませんでした。入力したコードはこの欄に残っています。'; }
}
function edit(recipe: FeatureRecipe) {
  editing.value = recipe.id; title.value = recipe.title; description.value = recipe.description;
  target.value = recipe.target;
  imports.value = recipe.imports; setup.value = recipe.setup; frame.value = recipe.frame; cleanup.value = recipe.cleanup;
  form.value = true;
}
function remove(recipe: FeatureRecipe) {
  try {
    localStorage.removeItem(recipeStoragePrefix + recipe.id); load();
    if (editing.value === recipe.id) { editing.value = null; form.value = false; }
  } catch { storageError.value = 'ボタンを削除できませんでした。'; }
}
function storage(event: StorageEvent) { if (event.key === null || event.key.startsWith(recipeStoragePrefix)) load(); }
async function openCreate(location: FeatureTarget = 'items') {
  editing.value = null; target.value = location; form.value = true;
  await nextTick(); host.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
defineExpose({ openCreate });
onMounted(() => { load(); window.addEventListener('storage', storage); });
onUnmounted(() => window.removeEventListener('storage', storage));
</script>

<template>
  <section ref="host" class="sandbox-features sandbox-feature-manager" aria-labelledby="sandbox-features-heading">
    <header><div><p class="eyebrow">追加ボタンの設定</p><h2 id="sandbox-features-heading">自分のボタン</h2></div><button type="button" class="text-button" @click="form ? (form = false) : openCreate()">{{ form ? '入力欄を閉じる' : '＋ ボタンを作る' }}</button></header>
    <p class="sandbox-feature-intro">登録したボタンは、左側で選んだ「アイテム」または「カメラ」の説明欄に表示します。</p>
    <div class="sandbox-feature-list">
      <div v-for="recipe in custom" :key="recipe.id" class="sandbox-feature-item">
        <p class="sandbox-custom-recipe-title">{{ recipe.title }}<small>{{ recipe.target === 'camera' ? 'カメラ' : 'アイテム' }}の説明欄に表示</small></p>
        <div class="sandbox-feature-manage"><button type="button" :aria-label="`${recipe.title}ボタンを編集`" @click="edit(recipe)">編集</button><button type="button" :aria-label="`${recipe.title}ボタンを削除`" @click="remove(recipe)">削除</button></div>
      </div>
    </div>
    <p v-if="storageError" class="sandbox-feature-notice feature-failed" role="alert">{{ storageError }}</p>
    <form v-if="form" class="sandbox-feature-form" @submit.prevent="save">
      <h3>{{ editing ? 'ボタンを編集' : '自分の追加ボタンを作る' }}</h3>
      <p>ボタンはこのブラウザに保存され、他の作品でも使えます。初期化コードは <code>onMounted</code> の中に入ります。<code>scene</code>・<code>camera</code>・<code>renderer</code>・<code>THREE</code> を使えます。</p>
      <p><code>__id__</code> は押すたびに別の名前に置き換わります。下の球の例はSTL向けの大きさです。作品に合わせて調整してください。</p>
      <label>ボタンの名前<input v-model="title" required maxlength="40" /></label>
      <label for="sandbox-feature-target">追加する場所</label><select id="sandbox-feature-target" v-model="target"><option value="items">アイテムを宣言・配置する場所</option><option value="camera">カメラ・視点を決める場所</option></select>
      <label>説明<input v-model="description" maxlength="200" /></label>
      <label>初期化コード<textarea v-model="setup" required rows="8" spellcheck="false" maxlength="30000" /></label>
      <details><summary>import・毎フレーム・後片付け</summary>
        <label>import<textarea v-model="imports" rows="2" spellcheck="false" maxlength="10000" /></label>
        <label>毎フレームのコード<textarea v-model="frame" rows="3" spellcheck="false" maxlength="10000" /></label>
        <label>後片付けのコード<textarea v-model="cleanup" rows="3" spellcheck="false" maxlength="10000" /></label>
      </details>
      <div><button type="submit" class="sandbox-button sandbox-button-primary">ボタンを保存</button><button type="button" class="sandbox-button" @click="form = false; editing = null">キャンセル</button></div>
      <p>ボタンの編集・削除は、すでに作品へ追加したコードには影響しません。</p>
    </form>
  </section>
</template>
