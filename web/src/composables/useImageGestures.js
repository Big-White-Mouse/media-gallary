import { nextTick, onBeforeUnmount, ref } from 'vue';

// Pointer samples stay outside Vue. Only gesture boundaries notify the renderer.
export function useImageGestures(stage, currentImage, canSlide, onSlide) {
  const busy = ref(false);
  const pointers = new Map();
  let zoom = 1, panX = 0, panY = 0, offset = 0, width = 1, height = 1, imageWidth = 1, imageHeight = 1;
  let gesture, lastTap, pendingPoint, frame = 0, timer, animationId = 0, sliding = false, completeTransition;
  let trackTransition = 'none', zoomTransition = 'none';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const track = () => stage.value?.querySelector('#viewer-track');
  function paint() {
    frame = 0;
    applySample();
    const element = track();
    if (element) {
      element.style.transition = trackTransition;
      element.style.transform = `translate3d(calc(-100% + ${offset}px), 0, 0)`;
    }
    if (currentImage.value) {
      currentImage.value.style.transition = zoomTransition;
      currentImage.value.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
  function bounds() {
    const maxX = Math.max(0, (imageWidth * zoom - width) / 2);
    const maxY = Math.max(0, (imageHeight * zoom - height) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }
  function clampPan() {
    const rect = stage.value?.getBoundingClientRect();
    if (!rect) return;
    width = rect.width; height = rect.height;
    const image = currentImage.value;
    const ratio = image?.naturalWidth && image?.naturalHeight ? image.naturalWidth / image.naturalHeight : width / height;
    imageWidth = Math.min(width, height * ratio); imageHeight = imageWidth / ratio;
    bounds(); schedule();
  }
  function stopTransition() {
    animationId++; clearTimeout(timer);
    if (completeTransition) track()?.removeEventListener('transitionend', completeTransition);
    if (sliding && track()) offset = new DOMMatrixReadOnly(getComputedStyle(track()).transform).m41 + width;
    sliding = false; completeTransition = null; trackTransition = 'none';
  }
  function resetZoom(animate = false) {
    zoom = 1; panX = panY = 0;
    zoomTransition = animate && !reduced() ? 'transform .2s ease-out' : 'none';
  }
  function animateTrack(target, direction = 0) {
    stopTransition();
    const token = animationId;
    sliding = true; busy.value = true;
    // Commit start position before assigning an animated target.
    paint();
    requestAnimationFrame(() => {
      if (token !== animationId || !stage.value) return;
      trackTransition = reduced() ? 'none' : 'transform .22s cubic-bezier(.2,.75,.25,1)';
      offset = target; paint();
      let finished = false;
      completeTransition = async event => {
        if (event && (event.target !== track() || event.propertyName !== 'transform')) return;
        if (finished || token !== animationId) return;
        finished = true; clearTimeout(timer);
        track()?.removeEventListener('transitionend', completeTransition);
        if (direction) { onSlide(direction); await nextTick(); }
        if (token !== animationId) return;
        sliding = false; offset = 0; trackTransition = 'none'; busy.value = false; paint();
      };
      track()?.addEventListener('transitionend', completeTransition);
      timer = setTimeout(() => completeTransition?.(), reduced() ? 0 : 300);
    });
  }
  function slide(direction) {
    if (!canSlide.value) { animateTrack(0); return; }
    clampPan(); gesture = null; lastTap = null; resetZoom();
    animateTrack(direction > 0 ? -width : width, direction);
  }
  function toggleZoomAt(x, y) {
    if (zoom > 1) resetZoom(true);
    else {
      const rect = stage.value.getBoundingClientRect();
      zoom = 2.5;
      panX = (rect.left + rect.width / 2 - x) * (zoom - 1);
      panY = (rect.top + rect.height / 2 - y) * (zoom - 1);
      zoomTransition = reduced() ? 'none' : 'transform .2s ease-out';
      bounds();
    }
    schedule();
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function begin(moved = false) {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const [a, b] = points, rect = stage.value.getBoundingClientRect();
      gesture = { type: 'pinch', distance: Math.max(1, distance(a, b)), zoom, panX, panY,
        focalX: (a.x + b.x) / 2 - rect.left - width / 2, focalY: (a.y + b.y) / 2 - rect.top - height / 2 };
      lastTap = null; offset = 0;
    } else if (points.length) gesture = { type: 'drag', x: points[0].x, y: points[0].y, panX, panY, offset, started: performance.now(), moved };
    else gesture = null;
    trackTransition = zoomTransition = 'none';
  }
  function pointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('[role=button],button')) return;
    clampPan(); stopTransition(); busy.value = true;
    stage.value.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); begin();
  }
  function pointerMove(event) {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pendingPoint = { x: event.clientX, y: event.clientY };
    schedule();
  }
  function applySample() {
    if (!pendingPoint || !gesture) { pendingPoint = null; return; }
    const point = pendingPoint; pendingPoint = null;
    if (gesture.type === 'pinch') {
      const [a, b] = [...pointers.values()]; if (!b) return;
      zoom = Math.max(1, Math.min(5, gesture.zoom * distance(a, b) / gesture.distance));
      const ratio = zoom / gesture.zoom;
      panX = gesture.focalX + (gesture.panX - gesture.focalX) * ratio;
      panY = gesture.focalY + (gesture.panY - gesture.focalY) * ratio; bounds();
    } else {
      const dx = point.x - gesture.x, dy = point.y - gesture.y;
      gesture.moved ||= Math.hypot(dx, dy) > 8;
      if (zoom > 1) { panX = gesture.panX + dx; panY = gesture.panY + dy; bounds(); }
      else offset = gesture.offset + dx;
    }
  }
  function pointerUp(event) {
    if (!pointers.has(event.pointerId)) return;
    applySample();
    pointers.delete(event.pointerId);
    if (!gesture) { busy.value = false; return; }
    if (gesture.type === 'pinch' || pointers.size) { begin(true); busy.value = pointers.size > 0; return; }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y, duration = performance.now() - gesture.started;
    const tap = !gesture.moved && Math.hypot(dx, dy) < 8 && duration < 280;
    if (zoom === 1) {
      if (Math.abs(offset) > Math.abs(dy) && (Math.abs(offset) > Math.min(100, width * .2) || (duration < 300 && Math.abs(offset) > 28))) slide(offset < 0 ? 1 : -1);
      else if (Math.abs(offset) > 0) animateTrack(0);
      else busy.value = false;
    } else busy.value = false;
    if (tap && event.pointerType !== 'mouse') {
      const point = { x: event.clientX, y: event.clientY, time: performance.now() };
      if (lastTap && point.time - lastTap.time < 320 && distance(point, lastTap) < 36) { toggleZoomAt(point.x, point.y); lastTap = null; }
      else lastTap = point;
    } else lastTap = null;
    gesture = null;
  }
  function pointerCancel(event) {
    if (!pointers.delete(event.pointerId)) return;
    lastTap = null;
    if (pointers.size) begin(true);
    else { gesture = null; if (offset) animateTrack(0); else busy.value = false; }
  }
  function doubleClick(event) {
    if (event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents) return;
    clampPan(); toggleZoomAt(event.clientX, event.clientY);
  }
  onBeforeUnmount(() => { stopTransition(); cancelAnimationFrame(frame); pointers.clear(); });
  return { busy, slide, clampPan, pointerDown, pointerMove, pointerUp, pointerCancel, doubleClick };
}
