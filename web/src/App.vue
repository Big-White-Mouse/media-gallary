<script setup>
import { computed } from 'vue';
import GalleryBreadcrumbs from './components/GalleryBreadcrumbs.vue';
import GalleryGrid from './components/GalleryGrid.vue';
import MediaViewer from './components/MediaViewer.vue';
import { useGallery } from './composables/useGallery.js';

const { listing, breadcrumbs, loading, error, notice, preview,
  navigate, refresh, openPreview, updateImage, closePreview } = useGallery();
const previewItems = computed(() => preview.value?.type === 'image' ? listing.value.images : listing.value.videos);
</script>

<template>
  <header>
    <GalleryBreadcrumbs :items="breadcrumbs" @navigate="navigate" />
    <button class="refresh" type="button" :disabled="loading" @click="refresh">刷新</button>
  </header>
  <main :aria-busy="loading">
    <div v-if="loading" class="empty" role="status">正在加载媒体…</div>
    <div v-else-if="error" class="empty" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="refresh">重试</button>
    </div>
    <GalleryGrid v-else :listing="listing" @navigate="navigate" @preview="openPreview" />
  </main>
  <MediaViewer v-if="preview" :mode="preview.type" :items="previewItems" :selected-path="preview.path"
    @close="closePreview" @change="updateImage" />
  <div v-if="notice" class="toast" role="status">{{ notice }}</div>
</template>
