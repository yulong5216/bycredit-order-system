<script setup>
import { computed } from 'vue'
const props = defineProps({ page: { type: Number, default: 1 }, size: { type: Number, default: 10 }, total: { type: Number, default: 0 } })
const emit = defineEmits(['change'])
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)))
const visiblePages = computed(() => {
  const start = Math.max(1, Math.min(props.page - 2, pages.value - 4))
  return Array.from({ length: Math.min(5, pages.value) }, (_, i) => start + i)
})
</script>

<template>
  <div class="pager">
    <span>第 {{ page }} / {{ pages }} 页 · 共 {{ total }} 条</span>
    <div class="pager-btns">
      <button class="pg" :disabled="page <= 1" @click="emit('change', page - 1)">上一页</button>
      <button v-for="p in visiblePages" :key="p" class="pg" :class="{ active: p === page }" @click="emit('change', p)">{{ p }}</button>
      <button class="pg" :disabled="page >= pages" @click="emit('change', page + 1)">下一页</button>
    </div>
  </div>
</template>
