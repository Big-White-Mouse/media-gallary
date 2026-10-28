import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

const normalizePath = (value = '') => value.split(/[\\/]+/).filter(Boolean).join('/');

export function useGallery() {
  const currentPath = ref('');
  const listing = shallowRef({ folders: [], images: [], videos: [] });
  const loading = ref(true);
  const hasListing = ref(false);
  const error = ref('');
  const notice = ref('');
  const preview = shallowRef(null);
  let controller;
  let noticeTimer;
  let requestedPath = '';
  const snapshots = new Map();

  const breadcrumbs = computed(() => {
    const parts = currentPath.value.split('/').filter(Boolean);
    return [{ name: '根目录', path: '' }, ...parts.map((name, index) => ({
      name, path: parts.slice(0, index + 1).join('/'),
    }))];
  });

  function saveHistory(replace = false) {
    const url = new URL(location.href);
    if (currentPath.value) url.searchParams.set('path', currentPath.value);
    else url.searchParams.delete('path');
    history[replace ? 'replaceState' : 'pushState']({
      gallery: true, path: currentPath.value, preview: preview.value,
    }, '', url);
  }

  async function loadDirectory(path, reuse = true) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    requestedPath = normalizePath(path);
    const target = requestedPath;
    if (reuse && snapshots.has(target)) {
      listing.value = snapshots.get(target); currentPath.value = target; hasListing.value = true;
    }
    loading.value = true;
    error.value = '';
    try {
      const response = await fetch(`/api/browse?${reuse ? '' : 'refresh=1&'}path=${encodeURIComponent(requestedPath)}`, {
        cache: 'no-store', signal: request.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `加载失败（${response.status}）`);
      }
      const data = await response.json();
      if (request.signal.aborted) return false;
      currentPath.value = normalizePath(data.currentPath);
      listing.value = { folders: data.folders, images: data.images, videos: data.videos || [] };
      hasListing.value = true;
      snapshots.delete(target); snapshots.set(target, listing.value);
      while (snapshots.size > 5) snapshots.delete(snapshots.keys().next().value);
      return true;
    } catch (cause) {
      if (!request.signal.aborted) error.value = cause.message || '加载失败，请重试';
      return false;
    } finally {
      if (controller === request) loading.value = false;
    }
  }

  async function navigate(path) {
    if (normalizePath(path) === currentPath.value && !error.value && !loading.value) return;
    preview.value = null;
    if (await loadDirectory(path)) {
      saveHistory();
      window.scrollTo({ top: 0 });
    }
  }

  async function refresh() {
    if (await loadDirectory(error.value ? requestedPath : currentPath.value, false)) saveHistory(true);
  }

  function openPreview(type, item) {
    if (preview.value) return;
    preview.value = { type, path: item.path };
    saveHistory();
  }

  function updateImage(item) {
    preview.value = { type: 'image', path: item.path };
    saveHistory(true);
  }

  function closePreview() {
    if (preview.value) { preview.value = null; history.back(); }
  }

  function restorePreview(value) {
    const items = value?.type === 'image' ? listing.value.images : listing.value.videos;
    preview.value = value && items.some((item) => item.path === value.path) ? value : null;
  }

  async function onPopState(event) {
    preview.value = null;
    if (!event.state?.gallery) {
      if (currentPath.value) {
        await loadDirectory(currentPath.value.split('/').slice(0, -1).join('/'));
      } else {
        notice.value = '已经到达根目录';
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { notice.value = ''; }, 2400);
      }
      saveHistory();
      return;
    }
    const target = normalizePath(event.state.path);
    if (target !== currentPath.value || loading.value || error.value) {
      if (!await loadDirectory(target)) return;
    }
    restorePreview(event.state.preview);
  }

  onMounted(async () => {
    window.addEventListener('popstate', onPopState);
    const path = new URL(location.href).searchParams.get('path') || '';
    const state = history.state;
    if (!state?.gallery) {
      history.replaceState({ galleryBase: true }, '', location.href);
      // A base entry lets Android Back show a root-directory notice.
      history.pushState({ gallery: true, path: normalizePath(path) }, '', location.href);
    }
    if (await loadDirectory(path)) {
      restorePreview(state?.preview);
      saveHistory(true);
    }
  });

  onBeforeUnmount(() => {
    controller?.abort();
    clearTimeout(noticeTimer);
    window.removeEventListener('popstate', onPopState);
  });

  return { currentPath, listing, breadcrumbs, loading, hasListing, error, notice, preview,
    navigate, refresh, openPreview, updateImage, closePreview };
}
