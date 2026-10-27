<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
const props = defineProps({ item: { type: Object, required: true }, type: { type: String, required: true } });
defineEmits(['open']);
const thumbnail = ref(null);
let observer;

function loadThumbnail() {
  const video = thumbnail.value;
  if (!video || video.getAttribute('src')) return;
  video.src = props.item.url;
  video.load();
}
function releaseThumbnail() {
  const video = thumbnail.value;
  if (!video?.getAttribute('src')) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
}
function seekThumbnail() {
  const video = thumbnail.value;
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    video.currentTime = Math.min(0.1, video.duration / 2);
  }
}
onMounted(() => {
  if (props.type !== 'video') return;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadThumbnail();
      else releaseThumbnail();
    }, { rootMargin: '240px 0px', threshold: 0.01 });
    observer.observe(thumbnail.value);
  } else loadThumbnail();
});
onBeforeUnmount(() => { observer?.disconnect(); releaseThumbnail(); });
</script>

<template>
  <button type="button" :class="type === 'folder' ? 'folder-card' : ['card', { 'video-card': type === 'video' }]"
    :title="item.path" :aria-label="`${type === 'folder' ? '打开文件夹' : type === 'video' ? '播放视频' : '预览图片'}：${item.name}`"
    @click="$emit('open', item)">
    <span v-if="type === 'folder'" class="folder-icon">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path fill="currentColor" d="M5 15a6 6 0 0 1 6-6h15l7 7h20a6 6 0 0 1 6 6v27a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6V15Z" />
        <path fill="#f3cc7a" d="M5 25h54v24a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6V25Z" />
      </svg>
    </span>
    <img v-else-if="type === 'image'" class="thumb" :src="item.url" :alt="item.name" loading="lazy" decoding="async">
    <template v-else>
      <video ref="thumbnail" class="thumb" muted playsinline preload="metadata" aria-hidden="true" @loadedmetadata="seekThumbnail" />
      <span class="play-badge" aria-hidden="true">▶</span>
    </template>
    <span :class="type === 'folder' ? 'folder-label' : 'image-label'">
      <span class="card-label-text">{{ item.name }}</span>
    </span>
  </button>
</template>
