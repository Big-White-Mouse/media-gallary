import { computed, onBeforeUnmount, ref } from 'vue';

export function useImageGestures(stage, currentImage, canSlide, onSlide) {
  const zoom = ref(1), panX = ref(0), panY = ref(0);
  const offset = ref('translate3d(-100%, 0, 0)');
  const trackTransition = ref('none'), zoomTransition = ref('none');
  const pointers = new Map();
  let gesture, lastTap, slideTimer;
  let sliding = false;
  const trackStyle = computed(() => ({ transform: offset.value, transition: trackTransition.value }));
  const imageStyle = computed(() => ({
    transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${zoom.value})`,
    transition: zoomTransition.value,
  }));

  function clampPan() {
    const image = currentImage.value;
    const maxX = Math.max(0, (image?.clientWidth || 0) * (zoom.value - 1) / 2);
    const maxY = Math.max(0, (image?.clientHeight || 0) * (zoom.value - 1) / 2);
    panX.value = Math.max(-maxX, Math.min(maxX, panX.value));
    panY.value = Math.max(-maxY, Math.min(maxY, panY.value));
  }
  function resetZoom(animate = false) {
    zoom.value = 1;
    panX.value = panY.value = 0;
    zoomTransition.value = animate ? 'transform .22s ease' : 'none';
  }
  function snapTrack() {
    trackTransition.value = 'transform .22s ease';
    offset.value = 'translate3d(-100%, 0, 0)';
  }
  function slide(direction) {
    if (sliding) return;
    if (!canSlide.value) { snapTrack(); return; }
    sliding = true;
    gesture = null;
    lastTap = null;
    resetZoom();
    trackTransition.value = 'transform .24s ease';
    offset.value = `translate3d(${direction > 0 ? -200 : 0}%, 0, 0)`;
    slideTimer = setTimeout(() => {
      onSlide(direction);
      trackTransition.value = 'none';
      offset.value = 'translate3d(-100%, 0, 0)';
      sliding = false;
    }, 250);
  }
  function toggleZoomAt(x, y) {
    if (sliding) return;
    if (zoom.value > 1) { resetZoom(true); return; }
    const rect = stage.value.getBoundingClientRect();
    zoom.value = 2.5;
    panX.value = (rect.left + rect.width / 2 - x) * (zoom.value - 1);
    panY.value = (rect.top + rect.height / 2 - y) * (zoom.value - 1);
    zoomTransition.value = 'transform .22s ease';
    clampPan();
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function beginGesture(moved = false) {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      const rect = stage.value.getBoundingClientRect();
      gesture = {
        type: 'pinch', startDistance: Math.max(1, distance(a, b)), startZoom: zoom.value,
        startPanX: panX.value, startPanY: panY.value,
        focalX: (a.x + b.x) / 2 - (rect.left + rect.width / 2),
        focalY: (a.y + b.y) / 2 - (rect.top + rect.height / 2),
      };
      lastTap = null;
      offset.value = 'translate3d(-100%, 0, 0)';
    } else if (points.length === 1) {
      gesture = {
        type: 'drag', startX: points[0].x, startY: points[0].y,
        startPanX: panX.value, startPanY: panY.value, startedAt: Date.now(), moved,
      };
    } else gesture = null;
    trackTransition.value = 'none';
    zoomTransition.value = 'none';
  }
  function pointerDown(event) {
    if (sliding || (event.pointerType === 'mouse' && event.button !== 0)) return;
    stage.value.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginGesture();
  }
  function pointerMove(event) {
    if (!pointers.has(event.pointerId) || !gesture || sliding) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.type === 'pinch') {
      const [a, b] = [...pointers.values()];
      if (!b) return;
      zoom.value = Math.max(1, Math.min(5, gesture.startZoom * distance(a, b) / gesture.startDistance));
      const ratio = zoom.value / gesture.startZoom;
      panX.value = gesture.focalX + (gesture.startPanX - gesture.focalX) * ratio;
      panY.value = gesture.focalY + (gesture.startPanY - gesture.focalY) * ratio;
      clampPan();
      return;
    }
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    gesture.moved ||= Math.hypot(dx, dy) > 8;
    if (zoom.value > 1) {
      panX.value = gesture.startPanX + dx;
      panY.value = gesture.startPanY + dy;
      clampPan();
    } else offset.value = `translate3d(calc(-100% + ${dx}px), 0, 0)`;
  }
  function pointerUp(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!gesture || sliding) return;
    if (gesture.type === 'pinch' || pointers.size) { beginGesture(true); return; }
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    const duration = Date.now() - gesture.startedAt;
    const wasTap = !gesture.moved && Math.hypot(dx, dy) < 8 && duration < 280;
    if (zoom.value === 1) {
      const threshold = Math.min(100, stage.value.clientWidth * 0.2);
      if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > threshold || (duration < 300 && Math.abs(dx) > 28))) {
        slide(dx < 0 ? 1 : -1);
      } else snapTrack();
    }
    if (wasTap && event.pointerType !== 'mouse') {
      const point = { x: event.clientX, y: event.clientY, time: Date.now() };
      if (lastTap && point.time - lastTap.time < 320 && distance(point, lastTap) < 36) {
        toggleZoomAt(point.x, point.y);
        lastTap = null;
      } else lastTap = point;
    } else lastTap = null;
    gesture = null;
  }
  function pointerCancel(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!sliding) snapTrack();
    beginGesture(true);
    lastTap = null;
  }
  function doubleClick(event) {
    // Touch double taps are handled above, avoiding the synthetic dblclick.
    if (event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents) return;
    toggleZoomAt(event.clientX, event.clientY);
  }
  onBeforeUnmount(() => { clearTimeout(slideTimer); pointers.clear(); });
  return { trackStyle, imageStyle, slide, clampPan, pointerDown, pointerMove, pointerUp, pointerCancel, doubleClick };
}
