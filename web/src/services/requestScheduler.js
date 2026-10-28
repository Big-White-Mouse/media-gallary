const abortError = () => new DOMException('已取消', 'AbortError');
export function createScheduler(limit, originalLimit = limit) {
  const queue = [];
  let active = 0, originals = 0, sequence = 0;
  function drain() {
    queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
    while (active < limit) {
      const index = queue.findIndex(job => !job.signal.aborted && (job.kind !== 'original' || originals < originalLimit));
      if (index < 0) break;
      const job = queue.splice(index, 1)[0];
      active++; if (job.kind === 'original') originals++;
      job.started = true;
      Promise.resolve().then(() => { job.signal.throwIfAborted(); return job.run(job.signal); })
        .then(job.resolve, job.reject).finally(() => {
          job.signal.removeEventListener('abort', job.cancel);
          active--; if (job.kind === 'original') originals--;
          drain();
        });
    }
  }
  return {
    run(run, { signal, priority = 2, kind = 'thumbnail' }) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(abortError()); return; }
        const job = { run, signal, priority, kind, resolve, reject, order: sequence++ };
        job.cancel = () => {
          if (!job.started) {
            const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
            signal.removeEventListener('abort', job.cancel);
          }
          reject(abortError()); drain();
        };
        signal.addEventListener('abort', job.cancel, { once: true });
        queue.push(job); drain();
      });
    },
  };
}
export const requests = createScheduler(4, 1);
export const decodes = createScheduler(1, 1);
export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const cancel = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
