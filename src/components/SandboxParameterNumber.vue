<script setup lang="ts">
const props = defineProps<{ label: string; min: number; max: number; step: number }>();
const value = defineModel<number>({ required: true });
function input(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const next = event.target.valueAsNumber;
  if (Number.isFinite(next)) value.value = Math.min(props.max, Math.max(props.min, next));
}
function restore(event: FocusEvent) {
  if (event.target instanceof HTMLInputElement) event.target.value = String(value.value);
}
</script>

<template>
  <label class="sandbox-parameter-number"><span>{{ label }}</span><span>
    <input type="range" :aria-label="`${label}のスライダー`" :value="value" :min="min" :max="max" :step="step" @input="input" />
    <input type="number" :aria-label="label" :value="value" :min="min" :max="max" :step="step" @input="input" @blur="restore" />
  </span></label>
</template>
