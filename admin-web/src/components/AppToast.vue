<script setup>
import { toastState } from '../utils/feedback'
</script>

<template>
  <div class="toast" :class="[toastState.type, { show: toastState.show }]" role="status" aria-live="polite">
    {{ toastState.message }}
  </div>
</template>
