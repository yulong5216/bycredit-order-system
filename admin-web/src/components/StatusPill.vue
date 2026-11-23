<script setup>
import { computed } from 'vue'
import { statusMeta, billMeta } from '../utils/format'

const props = defineProps({ status: String, bill: Boolean, label: String, tone: String })
const meta = computed(() => props.bill ? billMeta(props.status) : statusMeta(props.status))
</script>

<template>
  <span class="pill" :class="tone || meta[1]">{{ label || meta[0] }}</span>
</template>
