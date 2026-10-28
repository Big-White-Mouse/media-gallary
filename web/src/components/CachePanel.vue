<script setup>
import { onMounted, ref } from 'vue';
import { clearImageMemory } from '../services/imageResources.js';
const props = defineProps({ currentPath: { type: String, default: '' } });
const emit = defineEmits(['close']);
const dialog = ref(null), data = ref(null), pending = ref(false), message = ref(''), limit = ref(2048);
const mb = value => `${(value / 1024 ** 2).toFixed(2)} MiB`;
async function refresh() {
  const response = await fetch('/api/cache', { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '无法读取缓存状态');
  data.value = result; limit.value = Math.round(result.maxBytes / 1024 ** 2);
}
async function act(action, scope = '') {
  pending.value = true; message.value = '';
  try {
    const response = await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gallery-Manage': '1' },
      body: JSON.stringify({ action, scope, maxBytes: Math.round(Number(limit.value) * 1024 ** 2) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '缓存操作失败');
    if (action === 'clear') clearImageMemory();
    message.value = `${action === 'clear' || action === 'prune' ? `已释放 ${mb(result.freedBytes)}。` : '已完成。'}${result.paused ? '生成已暂停，恢复后才会重新生成。' : ''}${result.failures?.length ? ` ${result.failures.length} 项失败：${result.failures.map(f => `${f.path}: ${f.error}`).join('；')}` : ''}`;
    await refresh();
  } catch (error) { message.value = error.message; }
  finally { pending.value = false; }
}
onMounted(async () => { dialog.value.showModal(); try { await refresh(); } catch (error) { message.value = error.message; } });
</script>
<template>
  <dialog ref="dialog" class="cache-panel" aria-labelledby="cache-title" @cancel.prevent="emit('close')">
    <div class="cache-heading"><h2 id="cache-title">缩略图管理</h2><button @click="emit('close')">关闭</button></div>
    <p>每张原图仅一份缩略图，存放在原图目录的 .gallery-thumbnails 子目录。清理不会删除原图。</p>
    <template v-if="data">
      <p>已登记：{{ data.count }} 张 · {{ mb(data.bytes) }} / {{ mb(data.maxBytes) }} · {{ data.paused ? '已暂停生成' : '按需生成' }}</p>
      <div class="cache-actions">
        <button :disabled="pending" @click="act(data.paused ? 'resume' : 'pause')">{{ data.paused ? '恢复生成' : '暂停生成' }}</button>
        <button :disabled="pending" @click="act('clear', currentPath)">清理当前目录及子目录</button>
        <button :disabled="pending" @click="act('clear')">清空全部已登记缩略图</button>
        <button :disabled="pending" @click="act('prune')">清理失效缓存</button>
        <button :disabled="pending" @click="act('scan')">扫描并登记已有缓存</button>
      </div>
      <label>容量上限（MiB） <input v-model="limit" type="number" min="1" step="1" /></label>
      <button :disabled="pending" @click="act('limit')">保存上限</button>
      <ul class="cache-locations"><li v-for="entry in data.directories" :key="entry.path">{{ entry.location || entry.path || '根目录' }}<br>{{ entry.error || `${entry.count} 张 · ${mb(entry.bytes)}` }}</li></ul>
    </template>
    <p v-if="pending" role="status">正在处理，可关闭此面板，操作会在后台完成…</p>
    <p v-if="message" role="status">{{ message }}</p>
  </dialog>
</template>
