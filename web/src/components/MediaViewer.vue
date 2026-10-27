<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useImageGestures } from '../composables/useImageGestures.js';
const props = defineProps({
  mode: { type: String, required: true },
  items: { type: Array, required: true },
  selectedPath: { type: String, required: true },
});
const emit = defineEmits(['close', 'change']);
const dialog = ref(null), stage = ref(null), currentImage = ref(null), video = ref(null);
const index = computed(() => Math.max(0, props.items.findIndex((item) => item.path === props.selectedPath)));
const selected = computed(() => props.items[index.value]);
const wrappedIndex = (value) => (value + props.items.length) % props.items.length;
const slides = computed(() => [-1, 0, 1].map((delta) => props.items[wrappedIndex(index.value + delta)]));
const canSlide = computed(() => props.mode === 'image' && props.items.length > 1);
const { trackStyle, imageStyle, slide, clampPan, pointerDown, pointerMove, pointerUp, pointerCancel, doubleClick }
  = useImageGestures(stage, currentImage, canSlide, (direction) => {
    emit('change', props.items[wrappedIndex(index.value + direction)]);
  });
let previousOverflow;
let previouslyFocused;
function keydown(event) {
  if (props.mode !== 'image') return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    slide(event.key === 'ArrowLeft' ? -1 : 1);
  }
}
onMounted(() => {
  previousOverflow = document.body.style.overflow;
  previouslyFocused = document.activeElement;
  document.body.style.overflow = 'hidden';
  dialog.value.showModal();
  if (video.value) video.value.play().catch(() => {});
  window.addEventListener('keydown', keydown);
  window.addEventListener('resize', clampPan);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('resize', clampPan);
  if (video.value) {
    video.value.pause();
    video.value.removeAttribute('src');
    video.value.load();
  }
  dialog.value.close();
  document.body.style.overflow = previousOverflow;
  previouslyFocused?.focus();
});
</script>

<template>
  <dialog ref="dialog" id="dialog" aria-labelledby="caption" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="viewer">
      <div v-if="mode === 'image'" id="viewer-stage" ref="stage"
        @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp"
        @pointercancel="pointerCancel" @lostpointercapture="pointerCancel" @dblclick="doubleClick">
        <div id="viewer-track" :style="trackStyle">
          <div v-for="(item, slot) in slides" :key="slot" class="slide" :aria-hidden="slot !== 1">
            <img :ref="(element) => { if (slot === 1) currentImage = element; }" class="viewer-image"
              :src="item.url" :alt="item.name" :style="slot === 1 ? imageStyle : undefined" draggable="false" @load="clampPan">
          </div>
        </div>
      </div>
      <div v-else id="video-stage">
        <video id="video-player" ref="video" :src="selected.url" controls playsinline preload="metadata" />
      </div>
      <div id="caption">{{ selected.name }}</div>
    </div>
    <template v-if="canSlide">
      <button class="viewer-nav previous" type="button" aria-label="上一张" @click="slide(-1)">‹</button>
      <button class="viewer-nav next" type="button" aria-label="下一张" @click="slide(1)">›</button>
    </template>
    <button class="close" type="button" aria-label="关闭" autofocus @click="emit('close')">×</button>
  </dialog>
</template>
