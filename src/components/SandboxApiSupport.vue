<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { apiGuides } from '../sandbox/editor/api-guides';
import { referenceDefinitions } from '../content/reference-definitions';
import CopyCode from './CopyCode.vue';

const props = defineProps<{ symbol: string }>();
const query = ref('');
const selected = ref('BoxGeometry');
const guide = computed(() => apiGuides.find(item => item.name === selected.value) ?? apiGuides[0]);
const filtered = computed(() => apiGuides.filter(item => `${item.name} ${item.category} ${item.summary}`.toLowerCase().includes(query.value.trim().toLowerCase())));
const reference = computed(() => referenceDefinitions.find(item => item.aliases.includes(guide.value.name)));
watch(() => props.symbol, symbol => {
  const match = apiGuides.find(item => item.name === symbol && item.declaration.kind !== 'method');
  if (match) { selected.value = match.name; query.value = ''; }
}, { immediate: true });
</script>

<template>
  <section class="sandbox-api-support" aria-labelledby="api-support-heading">
    <header><div><p class="eyebrow">LOCAL ASSIST</p><h2 id="api-support-heading">APIを手元で調べる</h2></div><span>日本語ガイド {{ apiGuides.length }} 件</span></header>
    <p class="api-support-lead">コード内のクラス名をクリックすると説明が切り替わります。引数の型や候補はエディター内でも確認できます。</p>
    <label class="api-support-search">API・説明を検索<input v-model="query" type="search" placeholder="BoxGeometry、カメラ、光…" /></label>
    <div class="api-support-choices" role="group" aria-label="APIを選択"><button v-for="item in filtered" :key="item.name" type="button" :aria-pressed="selected === item.name" @click="selected = item.name">{{ item.declaration.kind === 'method' ? `${item.declaration.owner}.` : '' }}{{ item.name }}</button><p v-if="!filtered.length">該当するAPIはありません。型情報はエディター内で調べられます。</p></div>
    <div class="api-support-detail"><p class="api-category">{{ guide.category }}</p><h3>{{ guide.declaration.kind === 'method' ? `${guide.declaration.owner}.` : '' }}{{ guide.name }}</h3><p>{{ guide.summary }}</p>
      <dl v-if="guide.parameters.length" class="api-parameters"><div v-for="parameter in guide.parameters" :key="parameter.name"><dt><code>{{ parameter.name }}</code><small v-if="parameter.defaultValue">初期値 {{ parameter.defaultValue }}</small></dt><dd>{{ parameter.description }}</dd></div></dl><p v-else class="api-no-parameters">引数なしで作成できます。</p>
      <p class="api-parameter-note">引数の型・追加の省略可能な引数・オーバーロードは、入力中のヒントに表示されます。</p>
      <div class="api-example-heading"><h4>使い方の例</h4><CopyCode :code="guide.example" label="APIの例をコピー" /></div><pre><code>{{ guide.example }}</code></pre>
      <RouterLink v-if="reference" :to="`/reference/${reference.source.article}#${reference.source.section}`">リファレンスの本文も読む →</RouterLink>
    </div>
    <p class="api-support-footnote">Vue 3.5.44 / Three.js r182 の型と説明をローカルに同梱。外部サービスへのコード送信はありません。</p>
  </section>
</template>
