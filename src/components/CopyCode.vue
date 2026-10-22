<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ code: string; label?: string }>();
const message = ref('');
watch(() => props.code, () => { message.value = ''; });

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    message.value = 'コピーしました';
  } catch {
    message.value = 'コピーできませんでした';
  }
}
</script>

<template>
  <button type="button" class="copy-code" :aria-label="label ?? 'コードをコピー'" @click="copy">
    <span aria-live="polite">{{ message || 'コピー' }}</span>
  </button>
</template>
