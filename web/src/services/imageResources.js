import { requests, decodes, delay } from './requestScheduler.js';
const entries = new Map();
const MAX_BYTES = 96 * 1024 ** 2;
function evict() {
  let bytes = [...entries.values()].reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  for (const [key, entry] of [...entries].sort((a, b) => a[1].used - b[1].used)) {
    if (bytes <= MAX_BYTES && entries.size <= 128) break;
    if (entry.refs || !entry.objectUrl) continue;
    URL.revokeObjectURL(entry.objectUrl); entries.delete(key); bytes -= entry.bytes;
  }
}
// One encoded resource per versioned URL; consumers own their display nodes.
export function acquireImage(url, { priority = 2, kind = 'thumbnail' } = {}) {
  let entry = entries.get(url);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, refs: 0, used: performance.now(), bytes: 0, priority };
    entries.set(url, entry);
    entry.promise = (async () => {
      for (let attempt = 0; attempt < 60; attempt++) {
        const result = await requests.run(async signal => {
          const response = await fetch(url, { signal });
          if (response.status === 202 || response.status === 429) return { pending: true };
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `图片加载失败（${response.status}）`);
          }
          return { blob: await response.blob() };
        }, { signal: controller.signal, priority: entry.priority, kind });
        if (result.pending) { await delay(Math.min(500 + attempt * 100, 1500), controller.signal); continue; }
        controller.signal.throwIfAborted();
        entry.objectUrl = URL.createObjectURL(result.blob);
        entry.bytes = result.blob.size;
        return entry.objectUrl;
      }
      throw new Error('缩略图生成仍未完成，请重试。');
    })();
    entry.promise.catch(() => { if (entries.get(url) === entry) entries.delete(url); });
  }
  entry.refs++; entry.used = performance.now(); entry.priority = Math.min(entry.priority, priority);
  const consumer = new AbortController();
  let released = false;
  return {
    async prepare() {
      const objectUrl = await entry.promise;
      consumer.signal.throwIfAborted();
      return decodes.run(async signal => {
        const image = new Image();
        image.decoding = 'async'; image.draggable = false; image.src = objectUrl;
        await image.decode(); signal.throwIfAborted();
        entry.bytes = Math.max(entry.bytes, image.naturalWidth * image.naturalHeight * 4);
        evict(); return image;
      }, { signal: consumer.signal, priority, kind });
    },
    release() {
      if (released) return;
      released = true; consumer.abort(); entry.refs--; entry.used = performance.now();
      if (!entry.refs && !entry.objectUrl) { entry.controller.abort(); if (entries.get(url) === entry) entries.delete(url); }
      evict();
    },
  };
}
export function clearImageMemory() {
  for (const [key, entry] of entries) {
    if (entry.refs) continue;
    entry.controller.abort();
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    entries.delete(key);
  }
}
