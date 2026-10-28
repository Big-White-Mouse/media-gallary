<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MediaFrame from './MediaFrame.vue';
const props = defineProps({ item: { type: Object, required: true }, type: { type: String, required: true }, paused: Boolean });
defineEmits(['open']);
const thumbnail = ref(null);
let observer;
let visible = false;

function loadThumbnail() {
  const video = thumbnail.value;
  if (props.paused || !video || video.getAttribute('src')) return;
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
      visible = entry.isIntersecting;
      if (entry.isIntersecting) loadThumbnail();
      else releaseThumbnail();
    }, { rootMargin: '240px 0px', threshold: 0.01 });
    observer.observe(thumbnail.value);
  } else loadThumbnail();
});
watch(() => props.paused, paused => { if (paused) releaseThumbnail(); else if (visible) loadThumbnail(); });
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
    <MediaFrame v-else-if="type === 'image'" :item="item" :enabled="!paused" />
    <template v-else>
      <video ref="thumbnail" class="thumb" muted playsinline preload="metadata" aria-hidden="true" @loadedmetadata="seekThumbnail" />
      <span class="play-badge" aria-hidden="true">▶</span>
    </template>
    <span :class="type === 'folder' ? 'folder-label' : 'image-label'">
      <span class="card-label-text">{{ item.name }}</span>
    </span>
  </button>
</template>
