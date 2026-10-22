<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { buildPresetRecipe, createPresetDraft, featurePresets, presetTarget } from '../sandbox/feature-presets';
import type { FeaturePreset, PresetDraft } from '../sandbox/feature-presets';
import type { FeatureRecipe } from '../sandbox/feature-recipes';
import type { FeatureTarget } from '../sandbox/section-guide';
import SandboxParameterNumber from './SandboxParameterNumber.vue';

const props = defineProps<{ target: FeatureTarget | null; recipes: FeatureRecipe[]; busy: boolean }>();
const emit = defineEmits<{ feature: [recipe: FeatureRecipe]; create: [target: FeatureTarget] }>();
const category = ref<'shapes' | 'lighting'>('shapes');
const selected = ref<string | null>(null);
const drafts = reactive(new Map<string, PresetDraft>());
const error = ref('');
const shapeCount = featurePresets.filter(preset => preset.kind === 'mesh').length;
const lightingCount = featurePresets.filter(preset => preset.kind === 'light' || preset.kind === 'guide').length;
const presets = computed(() => featurePresets.filter(preset => presetTarget(preset) === props.target
  && (props.target === 'camera' || (category.value === 'shapes' ? preset.kind === 'mesh' : preset.kind === 'light' || preset.kind === 'guide'))));
const custom = computed(() => props.recipes.filter(recipe => recipe.target === props.target));
const draft = computed(() => {
  const value = selected.value && drafts.get(selected.value);
  return value && presetTarget(value.preset) === props.target ? value : null;
});
const generated = computed(() => {
  if (!draft.value) return null;
  try { return buildPresetRecipe(draft.value); } catch { return null; }
});
function getDraft(preset: FeaturePreset) {
  let value = drafts.get(preset.id);
  if (!value) { value = createPresetDraft(preset); drafts.set(preset.id, value); }
  return value;
}
function configure(preset: FeaturePreset) {
  getDraft(preset); selected.value = selected.value === preset.id ? null : preset.id; error.value = '';
}
function add(preset: FeaturePreset) {
  error.value = '';
  try { emit('feature', buildPresetRecipe(getDraft(preset))); }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason); }
}
function reset() {
  if (draft.value) drafts.set(draft.value.preset.id, createPresetDraft(draft.value.preset));
  error.value = '';
}
</script>

<template>
  <div v-show="target" class="sandbox-palette" :data-feature-target="target">
    <div class="sandbox-palette-heading"><span>ボタンでコードを追加</span><small>＋ すぐ追加 / 調整 値を指定</small></div>
    <div v-if="target === 'items'" class="sandbox-palette-tabs" role="group" aria-label="追加ボタンの種類">
      <button type="button" :aria-pressed="category === 'shapes'" @click="category = 'shapes'; selected = null">形を作る <span>{{ shapeCount }}</span></button>
      <button type="button" :aria-pressed="category === 'lighting'" @click="category = 'lighting'; selected = null">光・ガイド <span>{{ lightingCount }}</span></button>
    </div>
    <div class="sandbox-preset-list">
      <div v-for="preset in presets" :key="preset.id" class="sandbox-preset" :class="{ 'preset-selected': draft?.preset.id === preset.id }">
        <button type="button" :disabled="busy" :title="preset.description" @click="add(preset)">＋ {{ preset.title }}</button>
        <button type="button" class="sandbox-preset-configure" :aria-label="`${preset.title}：パラメータを調整`" :aria-expanded="draft?.preset.id === preset.id" @click="configure(preset)">調整</button>
      </div>
    </div>
    <form v-if="draft" class="sandbox-parameter-form" :aria-label="`${draft.preset.title}：パラメータ`" @submit.prevent="add(draft.preset)">
      <header><strong>{{ draft.preset.title }} · パラメータ</strong><button type="button" aria-label="パラメータを閉じる" @click="selected = null">×</button></header>
      <p>{{ draft.preset.description }}</p>
      <p class="sandbox-parameter-hint">値を決めて下のボタンで追加します。追加済みのコードはエディターで変更できます。</p>
      <template v-if="draft.kind === 'mesh'">
        <div class="sandbox-parameter-grid">
          <SandboxParameterNumber v-model="draft.size" label="大きさ（倍率）" :min="0.1" :max="10" :step="0.1" />
          <label class="sandbox-parameter-field"><span>材質 · material</span><select v-model="draft.material"><option value="basic">単色（光源不要）</option><option value="normal">法線の色</option><option value="standard">光に反応する材質</option></select></label>
          <label v-if="draft.material !== 'normal'" class="sandbox-parameter-field"><span>色 · color</span><span class="sandbox-parameter-color"><input v-model="draft.color" type="color" aria-label="色" /><code>{{ draft.color }}</code></span></label>
          <label class="sandbox-parameter-check"><input v-model="draft.wireframe" type="checkbox" />ワイヤーフレーム</label>
        </div>
        <p v-if="draft.material === 'standard'" class="sandbox-parameter-hint">この材質は光源が必要です。「光・ガイド」から平行光や環境光を追加できます。</p>
        <label class="sandbox-parameter-field"><span>配置の基準</span><select v-model="draft.placement"><option value="beside">モデルの隣・足元</option><option value="center">モデルの中央・足元</option></select></label>
        <div class="sandbox-parameter-grid">
          <SandboxParameterNumber v-model="draft.position.x" label="位置 X（左右）" :min="-20" :max="20" :step="0.1" />
          <SandboxParameterNumber v-model="draft.position.y" label="位置 Y（上下）" :min="-20" :max="20" :step="0.1" />
          <SandboxParameterNumber v-model="draft.position.z" label="位置 Z（前後）" :min="-20" :max="20" :step="0.1" />
          <SandboxParameterNumber v-model="draft.rotation" label="向き Y（度）" :min="-180" :max="180" :step="1" />
          <SandboxParameterNumber v-model="draft.speed" label="回転速度 Y（度/秒）" :min="-180" :max="180" :step="1" />
        </div>
        <details class="sandbox-parameter-details"><summary>幅・高さ・奥行きを個別に変える</summary><div class="sandbox-parameter-grid">
          <SandboxParameterNumber v-model="draft.scale.x" label="幅 X（倍率）" :min="0.1" :max="5" :step="0.1" />
          <SandboxParameterNumber v-model="draft.scale.y" label="高さ Y（倍率）" :min="0.1" :max="5" :step="0.1" />
          <SandboxParameterNumber v-model="draft.scale.z" label="奥行き Z（倍率）" :min="0.1" :max="5" :step="0.1" />
        </div></details>
      </template>
      <template v-else-if="draft.kind === 'light'">
        <div class="sandbox-parameter-grid">
          <label class="sandbox-parameter-field"><span>光の色 · color</span><span class="sandbox-parameter-color"><input v-model="draft.color" type="color" aria-label="光の色" /><code>{{ draft.color }}</code></span></label>
          <SandboxParameterNumber v-model="draft.intensity" label="明るさ · intensity" :min="0" :max="20" :step="0.1" />
          <template v-if="draft.preset.light !== 'ambient'">
            <SandboxParameterNumber v-model="draft.position.x" label="光源 X（左右）" :min="-20" :max="20" :step="0.1" />
            <SandboxParameterNumber v-model="draft.position.y" label="光源 Y（上下）" :min="-20" :max="20" :step="0.1" />
            <SandboxParameterNumber v-model="draft.position.z" label="光源 Z（前後）" :min="-20" :max="20" :step="0.1" />
          </template>
        </div>
        <p class="sandbox-parameter-hint">法線の色・単色の材質は光に反応しません。「光に反応する材質」で作った形に効果があります。点光源の明るさはモデルの大きさに合わせて補正します。</p>
      </template>
      <template v-else-if="draft.kind === 'guide'">
        <div class="sandbox-parameter-grid">
          <SandboxParameterNumber v-model="draft.size" label="大きさ（倍率）" :min="0.1" :max="10" :step="0.1" />
          <template v-if="draft.preset.helper === 'grid'">
            <SandboxParameterNumber v-model="draft.divisions" label="分割数 · divisions" :min="1" :max="100" :step="1" />
            <label class="sandbox-parameter-field"><span>線の色</span><span class="sandbox-parameter-color"><input v-model="draft.color" type="color" aria-label="線の色" /><code>{{ draft.color }}</code></span></label>
          </template>
        </div>
      </template>
      <template v-else-if="draft.kind === 'orbit'">
        <p class="sandbox-parameter-hint">導入済みの場合は既存コードを表示します。既存の設定を変えるときは、ハイライトしたコードを編集してください。</p>
        <div class="sandbox-parameter-grid">
          <SandboxParameterNumber v-model="draft.damping" label="操作の減衰 · dampingFactor" :min="0" :max="1" :step="0.01" />
          <SandboxParameterNumber v-model="draft.speed" label="自動回転の速さ" :min="-10" :max="10" :step="0.1" />
          <label class="sandbox-parameter-check"><input v-model="draft.autoRotate" type="checkbox" />自動で回転する</label>
          <label class="sandbox-parameter-check"><input v-model="draft.zoom" type="checkbox" />ホイールで拡大する</label>
          <label class="sandbox-parameter-check"><input v-model="draft.pan" type="checkbox" />右ドラッグで移動する</label>
        </div>
      </template>
      <template v-else-if="draft.kind === 'camera'">
        <div class="sandbox-parameter-grid">
          <SandboxParameterNumber v-model="draft.fov" label="画角 · fov（度）" :min="10" :max="120" :step="1" />
          <SandboxParameterNumber v-model="draft.zoom" label="ズーム · zoom" :min="0.2" :max="5" :step="0.1" />
        </div>
      </template>
      <p v-if="draft.kind === 'mesh' || draft.kind === 'guide' || draft.kind === 'light' && draft.preset.light !== 'ambient'" class="sandbox-parameter-hint">大きさ・位置の1単位 = モデルの長辺の1/4。空のシーンではカメラの距離から決めます。STLでも同じ操作で調整できます。</p>
      <details v-if="generated" class="sandbox-parameter-code"><summary>追加するコードを見る</summary><pre><code>{{ [generated.imports, generated.setup, generated.frame && '// 毎フレーム\n' + generated.frame, generated.cleanup && '// 後片付け\n' + generated.cleanup].filter(Boolean).join('\n\n') }}</code></pre></details>
      <p v-if="error" role="alert">{{ error }}</p>
      <footer><button type="submit" class="sandbox-parameter-add" :disabled="busy || !generated">{{ draft.kind === 'camera' ? 'この設定をコードに反映' : 'この設定で追加' }}</button><button type="button" @click="reset">初期値に戻す</button></footer>
    </form>
    <div class="sandbox-context-actions">
      <button v-for="recipe in custom" :key="recipe.id" type="button" :disabled="busy" :title="recipe.description" @click="emit('feature', recipe)">＋ {{ recipe.title }}</button>
      <button v-if="target" type="button" class="sandbox-context-create" @click="emit('create', target)">自分のボタンを作る</button>
    </div>
    <p v-if="error && !draft" role="alert">{{ error }}</p>
  </div>
</template>
