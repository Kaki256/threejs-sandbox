<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import providedStlUrl from '../assets/models/260720_3dPrintModel_4cm.stl?url';
import { createStlSource, providedStlName } from '../sandbox/stl';
import { createProject, initializeLibrary } from '../sandbox/storage';

const router = useRouter();
const error = ref('');
let disposed = false;
onUnmounted(() => { disposed = true; });
onMounted(async () => {
  try {
    const response = await fetch(providedStlUrl);
    if (!response.ok) throw new Error('STL ファイルを読み込めませんでした。');
    const buffer = await response.arrayBuffer();
    if (disposed) return;
    const model = createStlSource(buffer, providedStlName);
    initializeLibrary();
    const project = createProject(`STL · ${providedStlName.replace(/\.stl$/i, '')}`, model.source);
    await router.replace(`/sandbox/${project.id}`);
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause); }
});
</script>

<template>
  <section class="page-heading"><p class="lesson-number">STL SANDBOX</p><h1>{{ error ? 'モデルを読み込めませんでした' : 'STLから作品を作っています…' }}</h1><p role="status">{{ error || providedStlName }}</p><RouterLink to="/sandbox">作品一覧へ戻る →</RouterLink></section>
</template>
