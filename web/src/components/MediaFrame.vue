<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { acquireImage } from '../services/imageResources.js';
import { commitFrame } from '../services/renderCoordinator.js';
const props = defineProps({ item: Object, original: Boolean, enabled: { type: Boolean, default: true }, busy: Boolean, viewer: Boolean, priority: { type: Number, default: 2 } });
const emit = defineEmits(['ready']);
const host = ref(null), state = ref('loading'), error = ref('');
let generation = 0, thumbnailLease, originalLease, timer, cancelThumb, cancelOriginal, originalShown = false, previousUrl;
let thumbnailImage, originalRevision = 0;
function release() {
  originalRevision++;
  clearTimeout(timer); cancelThumb?.(); cancelOriginal?.();
  thumbnailLease?.release(); originalLease?.release();
  thumbnailLease = originalLease = null;
}
function display(image, original, token, revision = originalRevision) {
  return commitFrame(() => {
    if (token !== generation || !host.value || (!original && originalShown)) return;
    if (original && (!props.original || revision !== originalRevision)) return;
    image.className = props.viewer ? 'viewer-image' : 'thumb'; image.alt = props.item.name;
    host.value.replaceChildren(image);
    if (original) originalShown = true;
    state.value = original ? 'original' : 'thumbnail'; error.value = '';
    emit('ready', image);
  }, () => !original || !props.busy);
}
function queueOriginal(token = generation) {
  clearTimeout(timer);
  if (!props.original || !props.enabled || props.busy || originalShown || originalLease) return;
  timer = setTimeout(() => {
    if (token !== generation || props.busy) return;
    const revision = originalRevision;
    originalLease = acquireImage(props.item.url, { priority: 1, kind: 'original' });
    originalLease.prepare().then(image => {
      if (token === generation && revision === originalRevision) cancelOriginal = display(image, true, token, revision);
    }).catch(cause => {
      if (token === generation && revision === originalRevision && cause.name !== 'AbortError') error.value = cause.message;
    });
  }, 150);
}
function start() {
  generation++; const token = generation;
  release(); originalShown = false; error.value = '';
  if (props.item?.url !== previousUrl) { thumbnailImage = null; host.value?.replaceChildren(); state.value = 'loading'; }
  previousUrl = props.item?.url;
  if (!props.enabled || !props.item) return;
  if (props.item.thumbnailUrl) {
    thumbnailLease = acquireImage(props.item.thumbnailUrl, { priority: props.priority });
    thumbnailLease.prepare().then(image => {
      if (token === generation) { thumbnailImage = image; cancelThumb = display(image, false, token); }
    }).catch(cause => {
      if (token === generation && cause.name !== 'AbortError' && !originalShown) { error.value = cause.message; state.value = 'error'; }
    });
  }
  queueOriginal(token);
}
watch(() => [props.item?.url, props.item?.thumbnailUrl, props.enabled], start, { immediate: true, flush: 'post' });
watch(() => props.original, original => {
  if (original) {
    // Promotion must reuse the neighbor's live image, without another decode
    // or deferred render commit before the track snaps back to center.
    emit('ready', host.value?.querySelector('img') || null);
    queueOriginal();
  } else {
    originalRevision++; clearTimeout(timer); cancelOriginal?.();
    originalLease?.release(); originalLease = null; originalShown = false;
    if (thumbnailImage && host.value) {
      host.value.replaceChildren(thumbnailImage); state.value = 'thumbnail';
    }
    const image = host.value?.querySelector('img');
    if (image) { image.style.transform = ''; image.style.transition = ''; }
  }
}, { flush: 'post' });
watch(() => props.busy, busy => {
  if (busy) {
    clearTimeout(timer);
    // Keep an already-started current image download during pinch/drag. Its
    // display commit waits for idle; changing the selected image releases it.
  } else queueOriginal();
});
onBeforeUnmount(() => { generation++; release(); });
</script>
<template>
  <div class="media-frame" :class="{ 'viewer-frame': viewer }" :data-state="state">
    <div ref="host" class="image-host" />
    <span v-if="state === 'loading'" class="image-placeholder" aria-hidden="true">正在加载…</span>
    <span v-if="error" class="image-retry" role="button" tabindex="0" :title="error" @click.stop="start" @keydown.enter.stop="start">{{ viewer ? '加载失败，重试' : '重试' }}</span>
  </div>
</template>
