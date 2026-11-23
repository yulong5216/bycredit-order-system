<script setup>
defineProps({
  title: { type: String, default: '' },
  width: { type: Number, default: 520 },
  busy: Boolean
})
const emit = defineEmits(['close'])
</script>

<template>
  <div class="overlay open" @mousedown.self="!busy && emit('close')">
    <section class="modal" :style="{ maxWidth: `${width}px` }" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-head">
        <div class="modal-title">{{ title }}</div>
        <button class="x" type="button" :disabled="busy" aria-label="关闭" @click="emit('close')">×</button>
      </div>
      <div class="modal-body"><slot /></div>
      <div v-if="$slots.footer" class="modal-foot"><slot name="footer" /></div>
    </section>
  </div>
</template>
