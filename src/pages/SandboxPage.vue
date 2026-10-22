<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { findProject, initializeLibrary, storageNotice } from '../sandbox/storage';
import type { SandboxProject } from '../sandbox/storage';
import SandboxWorkspace from '../components/SandboxWorkspace.vue';

initializeLibrary();
const route = useRoute();
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const project = shallowRef<SandboxProject>();
watch(id, value => { project.value = findProject(value); }, { immediate: true });
</script>

<template>
  <SandboxWorkspace v-if="project" :key="project.id" :project="project" />
  <section v-else class="page-heading"><h1>作品が見つかりません</h1><p>{{ storageNotice || 'このブラウザに保存されている作品を一覧から選んでください。' }}</p><RouterLink to="/sandbox">サンドボックスの一覧へ戻る →</RouterLink></section>
</template>
