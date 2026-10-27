<script setup>
import { nextTick, ref, watch } from 'vue';
const props = defineProps({ items: { type: Array, required: true } });
defineEmits(['navigate']);
const nav = ref(null);
watch(() => props.items, async () => {
  await nextTick();
  if (nav.value) nav.value.scrollLeft = nav.value.scrollWidth;
});
</script>

<template>
  <nav id="breadcrumbs" ref="nav" aria-label="当前目录">
    <template v-for="(item, index) in items" :key="item.path">
      <span v-if="index" class="separator" aria-hidden="true">›</span>
      <button class="crumb" type="button" :aria-current="index === items.length - 1 ? 'page' : undefined"
        @click="$emit('navigate', item.path)">{{ item.name }}</button>
    </template>
  </nav>
</template>
