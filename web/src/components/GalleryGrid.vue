<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MediaCard from './MediaCard.vue';
const props = defineProps({ listing: { type: Object, required: true }, paused: Boolean });
const emit = defineEmits(['navigate', 'preview']);
const grid = ref(null), columns = ref(2), size = ref(180), gap = ref(10), firstRow = ref(0), rowCount = ref(7);
const items = computed(() => [
  ...props.listing.folders.map(item => ({ item, type: 'folder' })),
  ...props.listing.images.map(item => ({ item, type: 'image' })),
  ...props.listing.videos.map(item => ({ item, type: 'video' })),
]);
const stride = computed(() => size.value + gap.value);
const height = computed(() => Math.max(0, Math.ceil(items.value.length / columns.value) * stride.value - gap.value));
const visible = computed(() => items.value.slice(firstRow.value * columns.value, (firstRow.value + rowCount.value) * columns.value)
  .map((entry, offset) => ({ ...entry, index: firstRow.value * columns.value + offset })));
let frame, observer;
function measure() {
  frame = 0;
  if (!grid.value) return;
  const rect = grid.value.getBoundingClientRect();
  gap.value = innerWidth <= 520 ? 10 : 16;
  columns.value = innerWidth <= 520 ? 2 : Math.max(1, Math.floor((rect.width + gap.value) / (190 + gap.value)));
  size.value = (rect.width - (columns.value - 1) * gap.value) / columns.value;
  const rows = Math.ceil(innerHeight / stride.value) + 2;
  rowCount.value = rows;
  firstRow.value = Math.min(Math.max(0, Math.ceil(items.value.length / columns.value) - rows), Math.max(0, Math.floor(-rect.top / stride.value) - 1));
}
function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
function style(index) {
  return { position: 'absolute', width: `${size.value}px`, height: `${size.value}px`, left: `${(index % columns.value) * stride.value}px`, top: `${Math.floor(index / columns.value) * stride.value}px` };
}
async function focusIndex(index) {
  index = Math.max(0, Math.min(items.value.length - 1, index));
  const top = grid.value.getBoundingClientRect().top + scrollY + Math.floor(index / columns.value) * stride.value;
  if (top < scrollY + 70 || top + size.value > scrollY + innerHeight) window.scrollTo({ top: Math.max(0, top - 80), behavior: 'instant' });
  measure(); await nextTick(); grid.value.querySelector(`[data-index="${index}"]`)?.focus({ preventScroll: true });
}
function keydown(event) {
  const index = Number(event.target.closest('[data-index]')?.dataset.index);
  if (!Number.isInteger(index)) return;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns.value, ArrowDown: columns.value }[event.key];
  if (delta !== undefined || ['Home', 'End'].includes(event.key)) {
    event.preventDefault(); focusIndex(event.key === 'Home' ? 0 : event.key === 'End' ? items.value.length - 1 : index + delta);
  }
}
defineExpose({ focusItem: itemPath => { const index = items.value.findIndex(({ item }) => item.path === itemPath); if (index >= 0) focusIndex(index); } });
watch(() => props.listing, () => nextTick(schedule));
onMounted(() => { measure(); observer = new ResizeObserver(schedule); observer.observe(grid.value); window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule); });
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); });
</script>
<template>
  <section id="gallery" ref="grid" aria-label="媒体列表" :style="{ position: 'relative', display: 'block', height: items.length ? `${height}px` : 'auto' }" @keydown="keydown">
    <MediaCard v-for="entry in visible" :key="`${entry.type}:${entry.item.path}`" :data-index="entry.index" :style="style(entry.index)"
      :item="entry.item" :type="entry.type" :paused="paused" @open="entry.type === 'folder' ? emit('navigate', entry.item.path) : emit('preview', entry.type, entry.item)" />
    <div v-if="!items.length" class="empty">此目录中没有子目录或支持的图片、视频</div>
  </section>
</template>
