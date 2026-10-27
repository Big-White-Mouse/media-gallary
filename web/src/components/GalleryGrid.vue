<script setup>
import MediaCard from './MediaCard.vue';
defineProps({ listing: { type: Object, required: true } });
defineEmits(['navigate', 'preview']);
</script>

<template>
  <section id="gallery" aria-label="媒体列表">
    <MediaCard v-for="item in listing.folders" :key="`folder:${item.path}`" :item="item" type="folder" @open="$emit('navigate', item.path)" />
    <MediaCard v-for="item in listing.images" :key="`image:${item.path}`" :item="item" type="image" @open="$emit('preview', 'image', item)" />
    <MediaCard v-for="item in listing.videos" :key="`video:${item.path}`" :item="item" type="video" @open="$emit('preview', 'video', item)" />
    <div v-if="!listing.folders.length && !listing.images.length && !listing.videos.length" class="empty">
      此目录中没有子目录或支持的图片、视频
    </div>
  </section>
</template>
