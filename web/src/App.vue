<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import GalleryBreadcrumbs from './components/GalleryBreadcrumbs.vue';
import GalleryGrid from './components/GalleryGrid.vue';
import MediaViewer from './components/MediaViewer.vue';
import CachePanel from './components/CachePanel.vue';
import { useGallery } from './composables/useGallery.js';

const { currentPath, listing, breadcrumbs, loading, hasListing, error, notice, preview,
  navigate, refresh, openPreview, updateImage, closePreview } = useGallery();
const previewItems = computed(() => preview.value?.type === 'image' ? listing.value.images : listing.value.videos);
const cacheOpen = ref(false), grid = ref(null);
let previewOrigin;
function showPreview(type, item) { previewOrigin = item.path; openPreview(type, item); }
watch(preview, async (value, previous) => { if (!value && previous) { await nextTick(); grid.value?.focusItem(previewOrigin || previous.path); } });
</script>

<template>
  <header>
    <GalleryBreadcrumbs :items="breadcrumbs" @navigate="navigate" />
    <button class="refresh" type="button" @click="cacheOpen = true">缓存管理</button>
    <button class="refresh" type="button" :disabled="loading" @click="refresh">刷新</button>
  </header>
  <main :aria-busy="loading">
    <div v-if="loading" :class="hasListing ? 'loading-bar' : 'empty'" role="status">正在加载媒体…</div>
    <div v-if="error" class="load-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="refresh">重试</button>
    </div>
    <GalleryGrid v-if="hasListing" ref="grid" :listing="listing" :paused="!!preview || cacheOpen" @navigate="navigate" @preview="showPreview" />
  </main>
  <MediaViewer v-if="preview" :mode="preview.type" :items="previewItems" :selected-path="preview.path"
    @close="closePreview" @change="updateImage" />
  <div v-if="notice" class="toast" role="status">{{ notice }}</div>
  <CachePanel v-if="cacheOpen" :current-path="currentPath" @close="cacheOpen = false" />
</template>
